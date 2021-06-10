import {
  ChannelUpdate,
  ChannelUpdateEvent,
  FullChannelState,
  FullTransferState,
  IChannelSigner,
  IExternalValidation,
  IMessagingService,
  IVectorChainReader,
  IVectorProtocol,
  IVectorStore,
  ProtocolEventName,
  ProtocolEventPayloadsMap,
  ProtocolParams,
  Result,
  UpdateParams,
  UpdateType,
  TChannelUpdate,
  ProtocolError,
  jsonifyError,
  Values,
  UpdateIdentifier,
  PROTOCOL_VERSION,
} from "@connext/vector-types";
import { v4 as uuidV4 } from "uuid";
import {
  getCreate2MultisigAddress,
  getRandomBytes32,
  delay,
  getSignerAddressFromPublicIdentifier,
  generateMerkleRoot,
} from "@connext/vector-utils";
import { Evt } from "evt";
import pino from "pino";

import { QueuedUpdateError, RestoreError, ValidationError } from "./errors";
import { Cancellable, OtherUpdate, SelfUpdate, SerializedQueue } from "./queue";
import { outbound, inbound, OtherUpdateResult, SelfUpdateResult } from "./sync";
import {
  extractContextFromStore,
  getNextNonceForUpdate,
  persistChannel,
  validateChannelSignatures,
  validateParamSchema,
} from "./utils";

type EvtContainer = { [K in keyof ProtocolEventPayloadsMap]: Evt<ProtocolEventPayloadsMap[K]> };

export class Vector implements IVectorProtocol {
  private evts: EvtContainer = {
    [ProtocolEventName.CHANNEL_UPDATE_EVENT]: Evt.create<ChannelUpdateEvent>(),
  };

  // Hold the serialized queue for each channel
  // Do not interact with this directly. Always use getQueueAsync()
  private queues: Map<string, Promise<SerializedQueue<SelfUpdateResult, OtherUpdateResult> | undefined>> = new Map();

  // Hold a flag to indicate whether or not a channel is being restored
  private restorations: Map<string, boolean> = new Map();

  // make it private so the only way to create the class is to use `connect`
  private constructor(
    private readonly messagingService: IMessagingService,
    private readonly storeService: IVectorStore,
    private readonly signer: IChannelSigner,
    private readonly chainReader: IVectorChainReader,
    private readonly externalValidationService: IExternalValidation,
    private readonly logger: pino.BaseLogger,
    private readonly skipCheckIn: boolean,
  ) {}

  static async connect(
    messagingService: IMessagingService,
    storeService: IVectorStore,
    signer: IChannelSigner,
    chainReader: IVectorChainReader,
    logger: pino.BaseLogger,
    skipCheckIn: boolean,
    validationService?: IExternalValidation,
  ): Promise<Vector> {
    // Set the external validation service. If none is provided,
    // create an object with a matching interface to perform no
    // additional validation
    const externalValidation = validationService ?? {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      validateOutbound: (params: UpdateParams<any>, state: FullChannelState, activeTransfers: FullTransferState[]) =>
        Promise.resolve(Result.ok(undefined)),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      validateInbound: (update: ChannelUpdate<any>, state: FullChannelState, activeTransfers: FullTransferState[]) =>
        Promise.resolve(Result.ok(undefined)),
    };

    // Handles up asynchronous services and checks to see that
    // channel is `setup` plus is not in dispute
    const node = await new Vector(
      messagingService,
      storeService,
      signer,
      chainReader,
      externalValidation,
      logger,
      skipCheckIn,
    ).setupServices();

    logger.info("Vector Protocol connected 🚀!");
    return node;
  }

  get signerAddress(): string {
    return this.signer.address;
  }

  get publicIdentifier(): string {
    return this.signer.publicIdentifier;
  }

  // Primary protocol execution from the leader side
  private async executeUpdate(params: UpdateParams<any>): Promise<Result<FullChannelState, QueuedUpdateError>> {
    const method = "executeUpdate";
    const methodId = getRandomBytes32();
    this.logger.debug(
      {
        method,
        methodId,
        params,
        channelAddress: params.channelAddress,
        initiator: this.publicIdentifier,
      },
      "Executing update",
    );

    const queue = await this.getQueueAsync(this.publicIdentifier, params);
    if (queue === undefined) {
      return Result.fail(new QueuedUpdateError(QueuedUpdateError.reasons.ChannelNotFound, params));
    }

    // Add operation to queue
    const selfResult = await queue.executeSelfAsync({ params });

    if (selfResult.isError) {
      return Result.fail(selfResult.getError()!);
    }
    const { updatedTransfer, updatedChannel, updatedTransfers } = selfResult.getValue();
    this.evts[ProtocolEventName.CHANNEL_UPDATE_EVENT].post({
      updatedTransfer,
      updatedTransfers,
      updatedChannelState: updatedChannel,
    });

    return Result.ok(updatedChannel);
  }

  private createChannelQueue(
    channelAddress: string,
    aliceIdentifier: string,
  ): SerializedQueue<SelfUpdateResult, OtherUpdateResult> {
    // Create a cancellable outbound function to be used when initiating updates
    const cancellableOutbound: Cancellable<SelfUpdate, SelfUpdateResult> = async (
      initiated: SelfUpdate,
      cancel: Promise<unknown>,
    ) => {
      const cancelPromise = new Promise(async (resolve) => {
        let ret;
        try {
          ret = await cancel;
        } catch (e) {
          // TODO: cancel promise fails?
          ret = e;
        }
        return resolve({ cancelled: true, value: ret });
      });
      const outboundPromise = new Promise(async (resolve) => {
        const storeRes = await extractContextFromStore(
          this.storeService,
          initiated.params.channelAddress,
          initiated.params.id.id,
        );
        if (storeRes.isError) {
          // Return failure
          return Result.fail(
            new QueuedUpdateError(QueuedUpdateError.reasons.StoreFailure, initiated.params, undefined, {
              storeError: storeRes.getError()?.message,
            }),
          );
        }
        const { channelState, activeTransfers, update } = storeRes.getValue();
        if (update && update.aliceSignature && update.bobSignature) {
          // Update has already been executed, see explanation in
          // types/channel.ts for `UpdateIdentifier`
          const transfer = [UpdateType.create, UpdateType.resolve].includes(update.type)
            ? await this.storeService.getTransferState(update.details.transferId)
            : undefined;
          return resolve({
            cancelled: false,
            value: Result.ok({
              updatedTransfer: transfer,
              updatedChannel: channelState,
              updatedTransfers: activeTransfers,
            }),
            successfullyApplied: "previouslyExecuted",
          });
        }

        // Make sure channel isnt being restored
        if (this.restorations.get(initiated.params.channelAddress)) {
          return resolve({
            cancelled: false,
            value: Result.fail(
              new QueuedUpdateError(QueuedUpdateError.reasons.ChannelRestoring, initiated.params, channelState),
            ),
            successfullyApplied: "executed",
          });
        }
        try {
          const ret = await outbound(
            initiated.params,
            activeTransfers,
            channelState,
            this.chainReader,
            this.messagingService,
            this.externalValidationService,
            this.signer,
            this.logger,
          );
          return resolve({ cancelled: false, value: ret });
        } catch (e) {
          return resolve({
            cancelled: false,
            value: Result.fail(
              new QueuedUpdateError(QueuedUpdateError.reasons.UnhandledPromise, initiated.params, undefined, {
                ...jsonifyError(e),
                method: "outboundPromise",
              }),
            ),
          });
        }
      });
      this.logger.debug(
        {
          time: Date.now(),
          params: initiated.params,
          role: "outbound",
          channelAddress: initiated.params.channelAddress,
        },
        "Beginning race",
      );
      const res = (await Promise.race([outboundPromise, cancelPromise])) as {
        cancelled: boolean;
        value: unknown | Result<SelfUpdateResult>;
      };
      if (res.cancelled) {
        this.logger.debug(
          {
            time: Date.now(),
            params: initiated.params,
            role: "outbound",
            channelAddress: initiated.params.channelAddress,
          },
          "Cancelling update",
        );
        return undefined;
      }
      const value = res.value as Result<SelfUpdateResult>;
      if (value.isError) {
        this.logger.debug(
          {
            time: Date.now(),
            params: initiated.params,
            role: "outbound",
            channelAddress: initiated.params.channelAddress,
          },
          "Update failed",
        );
        return res.value as Result<SelfUpdateResult>;
      }
      // Save all information returned from the sync result
      const { updatedChannel, updatedTransfer, successfullyApplied } = value.getValue();
      this.logger.debug(
        {
          time: Date.now(),
          params: initiated.params,
          role: "outbound",
          channelAddress: initiated.params.channelAddress,
          updatedChannel,
          successfullyApplied,
        },
        "Update succeeded",
      );
      const saveRes = await persistChannel(this.storeService, updatedChannel, updatedTransfer);
      if (saveRes.isError) {
        return Result.fail(
          new QueuedUpdateError(QueuedUpdateError.reasons.StoreFailure, initiated.params, updatedChannel, {
            method: "saveChannelState",
            error: saveRes.getError()!.message,
          }),
        );
      }
      // If the update was not applied, but the channel was synced, return
      // undefined so that the proposed update may be re-queued
      if (successfullyApplied === "synced") {
        return undefined;
      }
      // All is well, return value from outbound (applies for already executed
      // updates as well)
      return value;
    };

    // Create a cancellable inbound function to be used when receiving updates
    const cancellableInbound: Cancellable<OtherUpdate, OtherUpdateResult> = async (
      received: OtherUpdate,
      cancel: Promise<unknown>,
    ) => {
      // Create a helper to respond to counterparty for errors generated
      // on inbound updates
      const returnError = async (
        reason: Values<typeof QueuedUpdateError.reasons>,
        state?: FullChannelState,
        context: any = {},
        error?: QueuedUpdateError,
      ): Promise<Result<never, QueuedUpdateError>> => {
        const e = error ?? new QueuedUpdateError(reason, received.update, state, context);
        await this.messagingService.respondWithProtocolError(received.inbox, e);
        return Result.fail(e);
      };

      let channelState: FullChannelState | undefined = undefined;
      const cancelPromise = new Promise(async (resolve) => {
        let ret;
        try {
          ret = await cancel;
        } catch (e) {
          // TODO: cancel promise fails?
          ret = e;
        }
        return resolve({ cancelled: true, value: ret });
      });
      const inboundPromise = new Promise(async (resolve) => {
        // Pull context from store
        const storeRes = await extractContextFromStore(
          this.storeService,
          received.update.channelAddress,
          received.update.id.id,
        );
        if (storeRes.isError) {
          // Send message with error
          return returnError(QueuedUpdateError.reasons.StoreFailure, undefined, {
            storeError: storeRes.getError()?.message,
          });
        }
        // Make sure channel isnt being restored
        if (this.restorations.get(received.update.channelAddress)) {
          return resolve({
            cancelled: false,
            value: Result.fail(
              new QueuedUpdateError(QueuedUpdateError.reasons.ChannelRestoring, received.update, channelState),
            ),
          });
        }

        // NOTE: no need to validate that the update has already been executed
        // because that is asserted on sync, where as an initiator you dont have
        // that certainty
        const stored = storeRes.getValue();
        channelState = stored.channelState;
        try {
          const ret = await inbound(
            received.update,
            received.previous,
            stored.activeTransfers,
            stored.channelState,
            this.chainReader,
            this.externalValidationService,
            this.signer,
            this.logger,
          );
          return resolve({ cancelled: false, value: ret });
        } catch (e) {
          return resolve({
            cancelled: false,
            value: Result.fail(
              new QueuedUpdateError(QueuedUpdateError.reasons.UnhandledPromise, received.update, undefined, {
                ...jsonifyError(e),
                method: "inboundPromise",
              }),
            ),
          });
        }
      });

      this.logger.debug(
        {
          time: Date.now(),
          update: received.update,
          role: "inbound",
          channelAddress: received.update.channelAddress,
        },
        "Beginning race",
      );
      const res = (await Promise.race([inboundPromise, cancelPromise])) as {
        cancelled: boolean;
        value: unknown | Result<OtherUpdateResult>;
      };

      if (res.cancelled) {
        this.logger.debug(
          {
            time: Date.now(),
            update: received.update,
            role: "inbound",
            channelAddress: received.update.channelAddress,
          },
          "Cancelling update",
        );
        // await returnError(QueuedUpdateError.reasons.Cancelled, channelState);
        return undefined;
      }
      const value = res.value as Result<OtherUpdateResult>;
      if (value.isError) {
        this.logger.debug(
          {
            time: Date.now(),
            update: received.update,
            role: "inbound",
            channelAddress: received.update.channelAddress,
          },
          "Update failed",
        );
        const error = value.getError() as QueuedUpdateError;
        const { state } = error.context;
        return returnError(error.message, state ?? channelState, undefined, error);
      }
      // Save the newly signed update to your channel
      const { updatedChannel, updatedTransfer } = value.getValue();
      this.logger.debug(
        {
          time: Date.now(),
          update: received.update,
          role: "inbound",
          channelAddress: received.update.channelAddress,
          updatedChannel,
        },
        "Update succeeded",
      );
      const saveRes = await persistChannel(this.storeService, updatedChannel, updatedTransfer);
      if (saveRes.isError) {
        return returnError(QueuedUpdateError.reasons.StoreFailure, updatedChannel, {
          saveError: saveRes.getError().message,
        });
      }
      await this.messagingService.respondToProtocolMessage(
        received.inbox,
        PROTOCOL_VERSION,
        updatedChannel.latestUpdate,
        (channelState as FullChannelState | undefined)?.latestUpdate,
      );
      return value;
    };
    const queue = new SerializedQueue<SelfUpdateResult, OtherUpdateResult>(
      this.publicIdentifier === aliceIdentifier,
      cancellableOutbound,
      cancellableInbound,
      // TODO: grab nonce without making store call? annoying to store in
      // memory, but doable
      async () => {
        const channel = await this.storeService.getChannelState(channelAddress);
        return channel?.nonce ?? 0;
      },
    );

    return queue;
  }

  /**
   * Checks current dispute status of all channels and flags them
   * as in dispute if a dispute has been started onchain.
   *
   * Also registers listeners for disputes in case any happen while
   * online.
   */
  private async registerDisputes(): Promise<void> {
    // Get all channel states from store

    // TODO: more efficient dispute events
    // // Register listeners for each channel on chain service for
    // // any dispute event
    // await Promise.all(
    //   channels.map((channel) => {
    //     return this.chainReader.registerChannel(channel.channelAddress, channel.networkContext.chainId);
    //   }),
    // );

    // // Register callback on chainReader events to properly
    // // update the `channel.inDispute` flag
    // // NOTE: you only need to add it for the first dispute
    // // event. The channels should be updated if a dispute
    // // exists onchain otherwise
    // this.chainReader.on(ChainReaderEvents.CHANNEL_DISPUTED, async (payload) => {
    //   if (payload.state.alice !== this.signerAddress && payload.state.bob !== this.signerAddress) {
    //     return;
    //   }
    //   this.logger.warn({ ...payload }, "Channel in dispute");
    //   await this.storeService.saveChannelDispute(payload.state.channelAddress, payload.dispute);
    // });

    // this.chainReader.on(ChainReaderEvents.TRANSFER_DISPUTED, async (payload) => {
    //   if (payload.state.initiator !== this.signerAddress && payload.state.responder !== this.signerAddress) {
    //     return;
    //   }
    //   await this.storeService.saveTransferDispute(payload.state.channelAddress, payload.dispute);
    // });

    // Check channel onchain to see if it is *currently* in dispute. This
    // is done to make sure any disputes that happened while the user was
    // offline are properly accounted for
    // TODO: how to account for transfer disputes efficiently?
    await this.syncDisputes();
  }

  // Returns undefined if getChannelState returns undefined (meaning the channel is not found)
  private getQueueAsync(
    setupAliceIdentifier,
    params: UpdateParams<any>,
  ): Promise<SerializedQueue<SelfUpdateResult, OtherUpdateResult> | undefined> {
    const channelAddress = params.channelAddress;
    const cache = this.queues.get(channelAddress);
    if (cache !== undefined) {
      return cache;
    }
    this.logger.debug({ channelAddress }, "Creating queue");

    let promise = (async () => {
      // This is subtle. We use a try/catch and remove the promise from the queue in the
      // even of an error. But, without this delay the promise may not be in the queue -
      // so it could get added next in a perpetually failing state.
      await delay(0);

      let result;
      try {
        let aliceIdentifier: string;
        if (params.type === UpdateType.setup) {
          aliceIdentifier = setupAliceIdentifier;
        } else {
          const channel = await this.storeService.getChannelState(channelAddress);
          if (!channel) {
            this.queues.delete(channelAddress);
            return undefined;
          }
          aliceIdentifier = channel.aliceIdentifier;
        }
        result = this.createChannelQueue(channelAddress, aliceIdentifier);
      } catch (e) {
        this.queues.delete(channelAddress);
        throw e;
      }
      return result;
    })();

    this.queues.set(channelAddress, promise);
    return promise;
  }

  private async setupServices(): Promise<Vector> {
    // TODO: REMOVE THIS!
    await this.messagingService.onReceiveLockMessage(
      this.publicIdentifier,
      async (lockInfo: Result<any>, from: string, inbox: string) => {
        if (from === this.publicIdentifier) {
          return;
        }
        const method = "onReceiveProtocolMessage";
        const methodId = getRandomBytes32();

        this.logger.error({ method, methodId }, "Counterparty using incompatible version");
        await this.messagingService.respondToLockMessage(
          inbox,
          Result.fail(
            new ValidationError(ValidationError.reasons.InvalidProtocolVersion, {} as any, undefined, {
              compatible: PROTOCOL_VERSION,
            }),
          ),
        );
      },
    );

    // response to incoming message where we are not the leader
    // steps:
    //  - validate and save state
    //  - send back message or error to specified inbox
    //  - publish updated state event
    await this.messagingService.onReceiveProtocolMessage(
      this.publicIdentifier,
      async (
        msg: Result<{ update: ChannelUpdate; previousUpdate: ChannelUpdate; protocolVersion: string }, ProtocolError>,
        from: string,
        inbox: string,
      ) => {
        if (from === this.publicIdentifier) {
          return;
        }
        const method = "onReceiveProtocolMessage";
        const methodId = getRandomBytes32();
        this.logger.debug({ method, methodId }, "Method start");

        if (msg.isError) {
          this.logger.error(
            { method, methodId, error: msg.getError()?.toJson() },
            "Error received from counterparty's initial message, this shouldn't happen",
          );
          return;
        }

        const received = msg.getValue();

        // Check the protocol version is compatible
        const theirVersion = (received.protocolVersion ?? "0.0.0").split(".");
        const ourVersion = PROTOCOL_VERSION.split(".");
        if (theirVersion[0] !== ourVersion[0] || theirVersion[1] !== ourVersion[1]) {
          this.logger.error({ method, methodId, theirVersion, ourVersion }, "Counterparty using incompatible version");
          await this.messagingService.respondWithProtocolError(
            inbox,
            new ValidationError(ValidationError.reasons.InvalidProtocolVersion, received.update, undefined, {
              responderVersion: ourVersion,
              initiatorVersion: theirVersion,
            }),
          );
          return;
        }

        // Verify that the message has the correct structure
        const keys = Object.keys(received);
        if (!keys.includes("update") || !keys.includes("previousUpdate") || !keys.includes("protocolVersion")) {
          this.logger.warn({ method, methodId, received: Object.keys(received) }, "Message malformed");
          return;
        }
        const receivedError = validateParamSchema(received.update, TChannelUpdate);
        if (receivedError) {
          this.logger.warn(
            { method, methodId, update: received.update, error: jsonifyError(receivedError) },
            "Received malformed proposed update",
          );
          return;
        }

        // // TODO: why in the world is this causing it to fail
        // // Previous update may be undefined, but if it exists, validate
        // console.log("******** validating schema");
        // const previousError = validateParamSchema(received.previousUpdate, TChannelUpdate);
        // console.log("******** ran validation", previousError);
        // if (previousError && received.previousUpdate) {
        //   this.logger.warn(
        //     { method, methodId, update: received.previousUpdate, error: jsonifyError(previousError) },
        //     "Received malformed previous update",
        //   );
        //   return;
        // }

        if (received.update.fromIdentifier === this.publicIdentifier) {
          this.logger.debug({ method, methodId }, "Received update from ourselves, doing nothing");
          return;
        }

        // Update has been received and is properly formatted. Before
        // applying the update, make sure it is the highest seen nonce

        // If queue does not exist, create it
        const queue = await this.getQueueAsync(received.update.fromIdentifier, received.update);
        if (queue === undefined) {
          return Result.fail(new QueuedUpdateError(QueuedUpdateError.reasons.ChannelNotFound, received.update));
        }

        // Add operation to queue
        this.logger.debug({ method, methodId }, "Executing other async");
        const result = await queue.executeOtherAsync({
          update: received.update,
          previous: received.previousUpdate,
          inbox,
        });
        if (result.isError) {
          this.logger.warn({ ...jsonifyError(result.getError()!) }, "Failed to apply inbound update");
          return;
        }
        const { updatedTransfer, updatedChannel, updatedTransfers } = result.getValue();
        this.evts[ProtocolEventName.CHANNEL_UPDATE_EVENT].post({
          updatedTransfer,
          updatedTransfers,
          updatedChannelState: updatedChannel,
        });
        this.logger.debug({ ...result.toJson() }, "Applied inbound update");
        return;
      },
    );

    // response to restore messages
    await this.messagingService.onReceiveRestoreStateMessage(
      this.publicIdentifier,
      async (restoreData: Result<{ chainId: number }, ProtocolError>, from: string, inbox: string) => {
        // If it is from yourself, do nothing
        if (from === this.publicIdentifier) {
          return;
        }
        const method = "onReceiveRestoreStateMessage";
        this.logger.debug({ method, data: restoreData.toJson(), inbox }, "Handling restore message");

        // Received error from counterparty
        if (restoreData.isError) {
          this.logger.error(
            { message: restoreData.getError()!.message, method },
            "Error received from counterparty restore",
          );
          return;
        }

        const data = restoreData.getValue();
        const [key] = Object.keys(data ?? []);
        if (key !== "chainId") {
          this.logger.error({ data }, "Message malformed");
          return;
        }

        // Counterparty looking to initiate a restore
        let channel: FullChannelState | undefined;
        const sendCannotRestoreFromError = (error: Values<typeof RestoreError.reasons>, context: any = {}) => {
          return this.messagingService.respondToRestoreStateMessage(
            inbox,
            Result.fail(new RestoreError(error, channel!, this.publicIdentifier, { ...context, method })),
          );
        };

        // Get info from store to send to counterparty
        const { chainId } = data as any;
        try {
          channel = await this.storeService.getChannelStateByParticipants(this.publicIdentifier, from, chainId);
        } catch (e) {
          return sendCannotRestoreFromError(RestoreError.reasons.CouldNotGetChannel, {
            storeMethod: "getChannelStateByParticipants",
            chainId,
            identifiers: [this.publicIdentifier, from],
          });
        }
        if (!channel) {
          return sendCannotRestoreFromError(RestoreError.reasons.ChannelNotFound, { chainId });
        }
        let activeTransfers: FullTransferState[];
        try {
          activeTransfers = await this.storeService.getActiveTransfers(channel.channelAddress);
        } catch (e) {
          return sendCannotRestoreFromError(RestoreError.reasons.CouldNotGetActiveTransfers, {
            storeMethod: "getActiveTransfers",
            chainId,
            channelAddress: channel.channelAddress,
          });
        }

        // Send info to counterparty
        this.logger.info(
          {
            method,
            channel: channel.channelAddress,
            nonce: channel.nonce,
            activeTransfers: activeTransfers.map((a) => a.transferId),
          },
          "Sending counterparty state to sync",
        );
        await this.messagingService.respondToRestoreStateMessage(inbox, Result.ok({ channel, activeTransfers }));
      },
    );

    // Handle disputes
    // TODO: if this is awaited, then it may cause problems with the
    // server-node startup (double check on prod). If it is *not* awaited
    // then you could have a race condition where this is not completed
    // before your channel is updated
    if (!this.skipCheckIn) {
      // TODO: gating this behind skipCheckIn for now to let router start up properly
      await this.registerDisputes();
    }
    return this;
  }

  private async generateIdentifier(): Promise<UpdateIdentifier> {
    const id = uuidV4();
    return {
      id,
      signature: await this.signer.signMessage(id),
    };
  }

  /*
   * ***************************
   * *** CORE PUBLIC METHODS ***
   * ***************************
   */
  // NOTE: The following top-level methods are called by users when
  // they are initiating a channel update. This means that any updates
  // generated using this code path will *not* pass through the validation
  // function. Instead, all validation must be done upfront before
  // calling `this.executeUpdate`. This includes all parameter validation,
  // as well as contextual validation (i.e. do I have sufficient funds to
  // create this transfer, is the channel in dispute, etc.)

  public async setup(params: ProtocolParams.Setup): Promise<Result<FullChannelState, QueuedUpdateError>> {
    const method = "setup";
    const methodId = getRandomBytes32();
    this.logger.debug({ method, methodId }, "Method start");
    // Validate all parameters
    const error = validateParamSchema(params, ProtocolParams.SetupSchema);
    if (error) {
      this.logger.error({ method, methodId, params, error: jsonifyError(error) });
      return Result.fail(error);
    }

    const id = await this.generateIdentifier();

    const create2Res = await getCreate2MultisigAddress(
      this.publicIdentifier,
      params.counterpartyIdentifier,
      params.networkContext.chainId,
      params.networkContext.channelFactoryAddress,
      this.chainReader,
    );
    if (create2Res.isError) {
      return Result.fail(
        new QueuedUpdateError(
          QueuedUpdateError.reasons.Create2Failed,
          { details: params, channelAddress: "", type: UpdateType.setup, id },
          undefined,
          {
            create2Error: create2Res.getError()?.message,
          },
        ),
      );
    }
    const channelAddress = create2Res.getValue();

    // Convert the API input to proper UpdateParam format
    const updateParams: UpdateParams<"setup"> = {
      channelAddress,
      details: params,
      type: UpdateType.setup,
      id,
    };

    const returnVal = await this.executeUpdate(updateParams);
    // TODO: more efficient dispute events
    // if (!returnVal.isError) {
    //   const channel = returnVal.getValue();
    //   this.logger.debug({ channelAddress }, "Registering channel for dispute events");
    //   const registrationRes = await this.chainReader.registerChannel(
    //     channel.channelAddress,
    //     channel.networkContext.chainId,
    //   );
    //   if (registrationRes.isError) {
    //     this.logger.warn(
    //       { ...jsonifyError(registrationRes.getError()!) },
    //       "Failed to register channel for dispute watching",
    //     );
    //   }
    // }
    this.logger.debug(
      {
        result: returnVal.isError ? jsonifyError(returnVal.getError()!) : returnVal.getValue(),
        method,
        methodId,
      },
      "Method complete",
    );
    return returnVal;
  }

  // Adds a deposit that has *already occurred* onchain into the multisig
  public async deposit(params: ProtocolParams.Deposit): Promise<Result<FullChannelState, QueuedUpdateError>> {
    const method = "deposit";
    const methodId = getRandomBytes32();
    this.logger.debug({ method, methodId }, "Method start");
    // Validate all input
    const error = validateParamSchema(params, ProtocolParams.DepositSchema);
    if (error) {
      return Result.fail(error);
    }

    // Convert the API input to proper UpdateParam format
    const updateParams: UpdateParams<"deposit"> = {
      channelAddress: params.channelAddress,
      type: UpdateType.deposit,
      details: params,
      id: await this.generateIdentifier(),
    };

    const returnVal = await this.executeUpdate(updateParams);
    this.logger.debug(
      {
        result: returnVal.isError ? jsonifyError(returnVal.getError()!) : returnVal.getValue(),
        method,
        methodId,
      },
      "Method complete",
    );
    return returnVal;
  }

  public async create(params: ProtocolParams.Create): Promise<Result<FullChannelState, QueuedUpdateError>> {
    const method = "create";
    const methodId = getRandomBytes32();
    this.logger.debug({ method, methodId }, "Method start");
    // Validate all input
    const error = validateParamSchema(params, ProtocolParams.CreateSchema);
    if (error) {
      return Result.fail(error);
    }

    // Convert the API input to proper UpdateParam format
    const updateParams: UpdateParams<"create"> = {
      channelAddress: params.channelAddress,
      type: UpdateType.create,
      details: params,
      id: await this.generateIdentifier(),
    };

    const returnVal = await this.executeUpdate(updateParams);
    this.logger.debug(
      {
        result: returnVal.isError ? jsonifyError(returnVal.getError()!) : returnVal.getValue(),
        method,
        methodId,
      },
      "Method complete",
    );
    return returnVal;
  }

  public async resolve(params: ProtocolParams.Resolve): Promise<Result<FullChannelState, QueuedUpdateError>> {
    const method = "resolve";
    const methodId = getRandomBytes32();
    this.logger.debug({ method, methodId }, "Method start");
    // Validate all input
    const error = validateParamSchema(params, ProtocolParams.ResolveSchema);
    if (error) {
      return Result.fail(error);
    }

    // Convert the API input to proper UpdateParam format
    const updateParams: UpdateParams<"resolve"> = {
      channelAddress: params.channelAddress,
      type: UpdateType.resolve,
      details: params,
      id: await this.generateIdentifier(),
    };

    const returnVal = await this.executeUpdate(updateParams);
    this.logger.debug(
      {
        result: returnVal.isError ? jsonifyError(returnVal.getError()!) : returnVal.getValue(),
        method,
        methodId,
      },
      "Method complete",
    );
    return returnVal;
  }

  public async restoreState(
    params: ProtocolParams.Restore,
  ): Promise<Result<FullChannelState, RestoreError | QueuedUpdateError>> {
    const method = "restoreState";
    const methodId = getRandomBytes32();
    this.logger.debug({ method, methodId }, "Method start");
    // Validate all input
    const error = validateParamSchema(params, ProtocolParams.RestoreSchema);
    if (error) {
      return Result.fail(error);
    }

    // Send message to counterparty, they will grab lock and
    // return information under lock, initiator will update channel,
    // then send confirmation message to counterparty, who will release the lock
    const { chainId, counterpartyIdentifier } = params;
    const restoreDataRes = await this.messagingService.sendRestoreStateMessage(
      Result.ok({ chainId }),
      counterpartyIdentifier,
      this.signer.publicIdentifier,
    );
    if (restoreDataRes.isError) {
      return Result.fail(restoreDataRes.getError() as RestoreError);
    }

    const { channel, activeTransfers } = restoreDataRes.getValue() ?? ({} as any);

    // Create helper to generate error
    const generateRestoreError = (
      error: Values<typeof RestoreError.reasons>,
      context: any = {},
    ): Result<FullChannelState, RestoreError> => {
      // handle error by returning it to counterparty && returning result
      const err = new RestoreError(error, channel, this.publicIdentifier, {
        ...context,
        method,
        params,
      });
      channel && this.restorations.set(channel.channelAddress, false);
      return Result.fail(err);
    };

    // Verify data exists
    if (!channel || !activeTransfers) {
      return generateRestoreError(RestoreError.reasons.NoData);
    }

    // Set restoration for channel to true
    this.restorations.set(channel.channelAddress, true);

    // Verify channel address is same as calculated
    const counterparty = getSignerAddressFromPublicIdentifier(counterpartyIdentifier);
    const calculated = await this.chainReader.getChannelAddress(
      channel.alice === this.signer.address ? this.signer.address : counterparty,
      channel.bob === this.signer.address ? this.signer.address : counterparty,
      channel.networkContext.channelFactoryAddress,
      chainId,
    );
    if (calculated.isError) {
      return generateRestoreError(RestoreError.reasons.GetChannelAddressFailed, {
        getChannelAddressError: jsonifyError(calculated.getError()!),
      });
    }
    if (calculated.getValue() !== channel.channelAddress) {
      return generateRestoreError(RestoreError.reasons.InvalidChannelAddress, {
        calculated: calculated.getValue(),
      });
    }

    // Verify signatures on latest update
    const sigRes = await validateChannelSignatures(
      channel,
      channel.latestUpdate.aliceSignature,
      channel.latestUpdate.bobSignature,
      "both",
    );
    if (sigRes.isError) {
      return generateRestoreError(RestoreError.reasons.InvalidSignatures, {
        recoveryError: sigRes.getError()!.message,
      });
    }

    // Verify transfers match merkleRoot
    const root = generateMerkleRoot(activeTransfers);
    if (root !== channel.merkleRoot) {
      return generateRestoreError(RestoreError.reasons.InvalidMerkleRoot, {
        calculated: root,
        merkleRoot: channel.merkleRoot,
        activeTransfers: activeTransfers.map((t) => t.transferId),
      });
    }

    // Verify nothing with a sync-able nonce exists in store
    const existing = await this.getChannelState(channel.channelAddress);
    const nonce = existing?.nonce ?? 0;
    const next = getNextNonceForUpdate(nonce, channel.latestUpdate.fromIdentifier === channel.aliceIdentifier);
    if (next === channel.nonce && channel.latestUpdate.type !== UpdateType.setup) {
      return generateRestoreError(RestoreError.reasons.SyncableState, {
        existing: nonce,
        toRestore: channel.nonce,
      });
    }
    if (nonce >= channel.nonce) {
      return generateRestoreError(RestoreError.reasons.SyncableState, {
        existing: nonce,
        toRestore: channel.nonce,
      });
    }

    // Save channel
    try {
      await this.storeService.saveChannelStateAndTransfers(channel, activeTransfers);
    } catch (e) {
      return generateRestoreError(RestoreError.reasons.SaveChannelFailed, {
        saveChannelStateAndTransfersError: e.message,
      });
    }

    this.restorations.set(channel.channelAddress, false);
    return Result.ok(channel);
  }

  ///////////////////////////////////
  // STORE METHODS
  public async getChannelState(channelAddress: string): Promise<FullChannelState | undefined> {
    return this.storeService.getChannelState(channelAddress);
  }

  public async getActiveTransfers(channelAddress: string): Promise<FullTransferState[]> {
    return this.storeService.getActiveTransfers(channelAddress);
  }

  public async getChannelStateByParticipants(
    aliceIdentifier: string,
    bobIdentifier: string,
    chainId: number,
  ): Promise<FullChannelState | undefined> {
    return this.storeService.getChannelStateByParticipants(aliceIdentifier, bobIdentifier, chainId);
  }

  public async getTransferState(transferId: string): Promise<FullTransferState | undefined> {
    return this.storeService.getTransferState(transferId);
  }

  public async getChannelStates(): Promise<FullChannelState[]> {
    return this.storeService.getChannelStates();
  }

  ///////////////////////////////////
  // EVENT METHODS

  public on<T extends ProtocolEventName>(
    event: T,
    callback: (payload: ProtocolEventPayloadsMap[T]) => void | Promise<void>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filter: (payload: ProtocolEventPayloadsMap[T]) => boolean = (_payload: ProtocolEventPayloadsMap[T]) => true,
  ): void {
    this.evts[event].pipe(filter).attach(callback);
  }

  public once<T extends ProtocolEventName>(
    event: T,
    callback: (payload: ProtocolEventPayloadsMap[T]) => void | Promise<void>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filter: (payload: ProtocolEventPayloadsMap[T]) => boolean = (_payload: ProtocolEventPayloadsMap[T]) => true,
  ): void {
    this.evts[event].pipe(filter).attachOnce(callback);
  }

  public waitFor<T extends ProtocolEventName>(
    event: T,
    timeout: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    filter: (payload: ProtocolEventPayloadsMap[T]) => boolean = (_payload: ProtocolEventPayloadsMap[T]) => true,
  ): Promise<ProtocolEventPayloadsMap[T]> {
    return this.evts[event].pipe(filter).waitFor(timeout);
  }

  public async off<T extends ProtocolEventName>(event?: T): Promise<void> {
    if (event) {
      this.evts[event].detach();
      return;
    }

    Object.values(this.evts).forEach((evt) => evt.detach());
    await this.messagingService.disconnect();
  }

  public async syncDisputes(): Promise<void> {
    const method = "syncDisputes";
    const allChannels = await this.storeService.getChannelStates();
    const channels = allChannels.filter((c) => c.alice === this.signerAddress || c.bob === this.signerAddress);

    await Promise.all(
      channels.map(async (channel) => {
        const disputeRes = await this.chainReader.getChannelDispute(
          channel.channelAddress,
          channel.networkContext.chainId,
        );
        if (disputeRes.isError) {
          this.logger.error(
            { channelAddress: channel.channelAddress, error: disputeRes.getError()!.message },
            "Could not get dispute",
          );
          return;
        }
        this.logger.info(
          {
            method,
            disputeRes: disputeRes.getValue(),
            channelAddress: channel.channelAddress,
            chainId: channel.networkContext.chainId,
          },
          "Got onchain dispute",
        );
        const dispute = disputeRes.getValue();
        if (!dispute) {
          return;
        }
        // Before saving the dispute record, you have to get the
        // CoreChannelState that is associated with the dispute record.
        // The CoreChannelState is only emitted in events, not stored
        // onchain, so you must query events

        // TODO: best way to query past events here? See `getCoreChannelState`
        // in the ethReader class
        try {
          // save dispute record
          // TODO: implement recovery from dispute #438
          await this.storeService.saveChannelDispute(channel.channelAddress, dispute);
        } catch (e) {
          this.logger.error(
            { channelAddress: channel.channelAddress, error: e.message },
            "Failed to update dispute on startup",
          );
        }
      }),
    );
  }
}
