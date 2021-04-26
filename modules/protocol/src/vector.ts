import * as merkle from "@connext/vector-merkle-tree";
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
  ResolveUpdateDetails,
  CreateUpdateDetails,
  ResolveTransferParams,
} from "@connext/vector-types";
import { encodeCoreTransferState, getTransferId } from "@connext/vector-utils";
import { generateMerkleTreeData, getCreate2MultisigAddress, getRandomBytes32 } from "@connext/vector-utils";
import { Evt } from "evt";
import pino from "pino";

import { QueuedUpdateError } from "./errors";
import { Cancellable, OtherUpdate, SelfUpdate, SerializedQueue } from "./queue";
import { outbound, inbound, OtherUpdateResult, SelfUpdateResult } from "./sync";
import { extractContextFromStore, persistChannel, validateParamSchema } from "./utils";

type EvtContainer = { [K in keyof ProtocolEventPayloadsMap]: Evt<ProtocolEventPayloadsMap[K]> };

export class Vector implements IVectorProtocol {
  private evts: EvtContainer = {
    [ProtocolEventName.CHANNEL_UPDATE_EVENT]: Evt.create<ChannelUpdateEvent>(),
  };

  // Hold the serialized queue for each channel
  private queues: Map<string, SerializedQueue<SelfUpdateResult, OtherUpdateResult>> = new Map();

  // Hold the merkle tree for each channel
  private trees: Map<string, merkle.Tree> = new Map();

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

    // If queue does not exist, create it
    if (!this.queues.has(params.channelAddress)) {
      this.logger.debug({ method, methodId }, "Creating queue");
      // Determine if this is alice
      let aliceIdentifier: string;
      if (params.type === UpdateType.setup) {
        aliceIdentifier = this.publicIdentifier;
      } else {
        const channel = await this.storeService.getChannelState(params.channelAddress);
        if (!channel) {
          return Result.fail(new QueuedUpdateError(QueuedUpdateError.reasons.ChannelNotFound, params));
        }
        aliceIdentifier = channel.aliceIdentifier;
      }
      this.createChannelQueue(params.channelAddress, aliceIdentifier);
    }

    // Add operation to queue
    const queue = this.queues.get(params.channelAddress)!;
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

  private createChannelQueue(channelAddress: string, aliceIdentifier: string): void {
    // Create a cancellable outbound function to be used when initiating updates
    const cancellableOutbound: Cancellable<SelfUpdate, SelfUpdateResult> = async (
      initiated: SelfUpdate,
      cancel: Promise<unknown>,
    ) => {
      // This channel nonce is used to derive the `transferId` should the
      // merkle root changes need to be undone if the `outbound` operation
      // is cancelled. Set to `0` to handle case where the store fails.
      // This is safe because the merkle library will not fail loudly if
      // removing a transferId that does not exist, and transfer ids can not
      // be generated at nonce 0
      let storedNonce = 0;
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
        const storeRes = await extractContextFromStore(this.storeService, initiated.params.channelAddress);
        if (storeRes.isError) {
          // Return failure
          return Result.fail(
            new QueuedUpdateError(QueuedUpdateError.reasons.StoreFailure, initiated.params, undefined, {
              storeError: storeRes.getError()?.message,
            }),
          );
        }
        const { channelState, activeTransfers } = storeRes.getValue();
        storedNonce = channelState?.nonce ?? 0;
        try {
          const ret = await outbound(
            initiated.params,
            activeTransfers,
            channelState,
            this.chainReader,
            this.messagingService,
            this.externalValidationService,
            this.signer,
            this.getUpdatedMerkleRoot.bind(this),
            this.undoMerkleRootUpdates.bind(this),
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
      const res = (await Promise.race([outboundPromise, cancelPromise])) as {
        cancelled: boolean;
        value: unknown | Result<SelfUpdateResult>;
      };
      if (res.cancelled) {
        // Undo the merkle root changes if outbound was cancelled
        if (initiated.params.type === UpdateType.create || initiated.params.type === UpdateType.resolve) {
          const transferId =
            initiated.params.type === "resolve"
              ? (initiated.params.details as ResolveUpdateDetails).transferId
              : getTransferId(
                  initiated.params.channelAddress,
                  storedNonce.toString(),
                  ((initiated.params.details as unknown) as CreateUpdateDetails).transferDefinition,
                  ((initiated.params.details as unknown) as CreateUpdateDetails).transferTimeout,
                );
          await this.undoMerkleRootUpdates(initiated.params.channelAddress, transferId, initiated.params.type);
        }
        return undefined;
      }
      const value = res.value as Result<SelfUpdateResult>;
      if (value.isError) {
        // Undo merkle root updates if the update failed
        if (initiated.params.type === UpdateType.create || initiated.params.type === UpdateType.resolve) {
          const transferId =
            initiated.params.type === "resolve"
              ? (initiated.params.details as ResolveTransferParams).transferId
              : getTransferId(
                  initiated.params.channelAddress,
                  storedNonce.toString(),
                  ((initiated.params.details as unknown) as CreateUpdateDetails).transferDefinition,
                  ((initiated.params.details as unknown) as CreateUpdateDetails).transferTimeout,
                );
          await this.undoMerkleRootUpdates(initiated.params.channelAddress, transferId, initiated.params.type);
        }
        return res.value as Result<SelfUpdateResult>;
      }
      // Save all information returned from the sync result
      const { updatedChannel, updatedTransfer, successfullyApplied } = value.getValue();
      const saveRes = await persistChannel(this.storeService, updatedChannel, updatedTransfer);
      if (saveRes.isError) {
        // Undo merkle root updates if saving fails
        if (initiated.params.type === UpdateType.create || initiated.params.type === UpdateType.resolve) {
          await this.undoMerkleRootUpdates(
            initiated.params.channelAddress,
            updatedTransfer!.transferId,
            initiated.params.type,
          );
        }
        return Result.fail(
          new QueuedUpdateError(QueuedUpdateError.reasons.StoreFailure, initiated.params, updatedChannel, {
            method: "saveChannelState",
            error: saveRes.getError()!.message,
          }),
        );
      }
      // If the update was not applied, but the channel was synced, return
      // undefined so that the proposed update may be re-queued
      if (!successfullyApplied) {
        // Merkle root changes are undone *before* syncing
        return undefined;
      }
      // All is well, return value from outbound
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
      ): Promise<Result<never, QueuedUpdateError>> => {
        // Always undo the merkle root change for the received update
        if (received.update.type === UpdateType.resolve || received.update.type === UpdateType.create) {
          await this.undoMerkleRootUpdates(
            received.update.channelAddress,
            (received.update.details as CreateUpdateDetails | ResolveUpdateDetails).transferId,
            received.update.type,
          );
        }
        const error = new QueuedUpdateError(reason, state?.latestUpdate ?? received.update, state, context);
        await this.messagingService.respondWithProtocolError(received.inbox, error);
        return Result.fail(error);
      };

      // Pull context from store
      const storeRes = await extractContextFromStore(this.storeService, received.update.channelAddress);
      if (storeRes.isError) {
        // Send message with error
        return returnError(QueuedUpdateError.reasons.StoreFailure, undefined, {
          storeError: storeRes.getError()?.message,
        });
      }
      const { channelState, activeTransfers } = storeRes.getValue();
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
        try {
          const ret = await inbound(
            received.update,
            received.previous,
            activeTransfers,
            channelState,
            this.chainReader,
            this.externalValidationService,
            this.signer,
            this.getUpdatedMerkleRoot.bind(this),
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

      const res = (await Promise.race([inboundPromise, cancelPromise])) as {
        cancelled: boolean;
        value: unknown | Result<OtherUpdateResult>;
      };

      if (res.cancelled) {
        await returnError(QueuedUpdateError.reasons.Cancelled, channelState);
        return undefined;
      }
      const value = res.value as Result<OtherUpdateResult>;
      if (value.isError) {
        return returnError(value.getError().message, channelState);
      }
      // Save the newly signed update to your channel
      const { updatedChannel, updatedTransfer } = value.getValue();
      const saveRes = await persistChannel(this.storeService, updatedChannel, updatedTransfer);
      if (saveRes.isError) {
        return returnError(QueuedUpdateError.reasons.StoreFailure, updatedChannel);
      }
      await this.messagingService.respondToProtocolMessage(
        received.inbox,
        updatedChannel.latestUpdate,
        channelState?.latestUpdate,
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

    this.queues.set(channelAddress, queue);
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

  private async setupServices(): Promise<Vector> {
    // response to incoming message where we are not the leader
    // steps:
    //  - validate and save state
    //  - send back message or error to specified inbox
    //  - publish updated state event
    await this.messagingService.onReceiveProtocolMessage(
      this.publicIdentifier,
      async (
        msg: Result<{ update: ChannelUpdate; previousUpdate: ChannelUpdate }, ProtocolError>,
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

        // Verify that the message has the correct structure
        const keys = Object.keys(received);
        if (!keys.includes("update") || !keys.includes("previousUpdate")) {
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

        // TODO: why in the world is this causing it to fail
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
        if (!this.queues.has(received.update.channelAddress)) {
          this.logger.debug({ method, methodId, channelAddress: received.update.channelAddress }, "Creating queue");
          let aliceIdentifier: string;
          if (received.update.type === UpdateType.setup) {
            aliceIdentifier = received.update.fromIdentifier;
          } else {
            const channel = await this.storeService.getChannelState(received.update.channelAddress);
            if (!channel) {
              return Result.fail(new QueuedUpdateError(QueuedUpdateError.reasons.ChannelNotFound, received.update));
            }
            aliceIdentifier = channel.aliceIdentifier;
          }
          this.createChannelQueue(received.update.channelAddress, aliceIdentifier);
        }

        // Add operation to queue
        const queue = this.queues.get(received.update.channelAddress)!;
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

  private getUpdatedMerkleRoot(
    channelAddress: string,
    activeTransfers: FullTransferState[],
    transfer: FullTransferState,
    update: typeof UpdateType.create | typeof UpdateType.resolve,
  ): string {
    let tree = this.trees.get(channelAddress);
    if (tree === undefined) {
      const generated = generateMerkleTreeData(activeTransfers);
      tree = generated.tree;
      this.trees.set(channelAddress, generated.tree);
    }
    update === UpdateType.resolve
      ? tree.deleteId(transfer.transferId)
      : tree.insertHex(encodeCoreTransferState(transfer));
    return tree.root();
  }

  private async undoMerkleRootUpdates(
    channelAddress: string,
    transferIdToUndo: string,
    updateToUndo: typeof UpdateType.create | typeof UpdateType.resolve,
  ): Promise<void> {
    const tree = this.trees.get(channelAddress);
    if (tree === undefined) {
      // Nothing to undo
      return;
    }
    // If undoing a resolve update, reinsert transfer
    if (updateToUndo === UpdateType.resolve) {
      // Pull transfer from store (should be in active)
      const transfer = await this.storeService.getTransferState(transferIdToUndo);
      if (!transfer) {
        // This is not performant, but something has gone wrong
        // with the store and the tree alignment. The safest thing
        // to do is delete the tree from memory and regenerate it
        tree.free();
        this.trees.delete(channelAddress);
        return;
      }
      tree.insertHex(encodeCoreTransferState(transfer));
      return;
    }
    // If undoing a create update, delete transfer
    tree.deleteId(transferIdToUndo);
    return;
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
          { details: params, channelAddress: "", type: UpdateType.setup },
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
