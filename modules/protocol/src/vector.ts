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
} from "@connext/vector-types";
import {
  bufferify,
  generateMerkleTreeData,
  getCreate2MultisigAddress,
  getRandomBytes32,
  hashCoreTransferState,
} from "@connext/vector-utils";
import { Evt } from "evt";
import pino from "pino";

import { OutboundChannelUpdateError, QueuedUpdateError } from "./errors";
import * as sync from "./sync";
import { getParamsFromUpdate, getTransferFromUpdate, validateSchema } from "./utils";

type EvtContainer = { [K in keyof ProtocolEventPayloadsMap]: Evt<ProtocolEventPayloadsMap[K]> };

export class Vector implements IVectorProtocol {
  private evts: EvtContainer = {
    [ProtocolEventName.CHANNEL_UPDATE_EVENT]: Evt.create<ChannelUpdateEvent>(),
  };

  // This holds the highest seen nonce (proposed or received) for each channel.
  // Will be used to determine the priority ordering of the queue currently
  // being executed
  private highestNonce: { [channelAddr: string]: number } = {};

  // This holds the current outbound update for each channel. Once the update
  // has been double signed, it is removed from the object. This will be used
  // to determine whether or not the update should be retried if you receive
  // an update while one is out for signature.
  private inProgressUpdate: { [channelAddr: string]: ChannelUpdate | undefined } = {};

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
  private async executeUpdate(
    params: UpdateParams<any>,
  ): Promise<Result<FullChannelState, OutboundChannelUpdateError>> {
    const method = "executeUpdate";
    const methodId = getRandomBytes32();
    this.logger.debug({
      method,
      methodId,
      step: "start",
      params,
      channelAddress: params.channelAddress,
      updateSender: this.publicIdentifier,
    });

    // Pull channel from store

    // Update highest seen nonce to next nonce

    // propose update using sync.outbound
    // should:
    // - add params to queue
    // - generate update from params
    // - update proposed class attr
    // - send proposal to counterparty

    // let aliceIdentifier: string;
    // let bobIdentifier: string;
    // let channel: FullChannelState | undefined;
    // if (params.type === UpdateType.setup) {
    //   aliceIdentifier = this.publicIdentifier;
    //   bobIdentifier = (params as UpdateParams<"setup">).details.counterpartyIdentifier;
    // } else {
    //   channel = await this.storeService.getChannelState(params.channelAddress);
    //   if (!channel) {
    //     return Result.fail(new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.ChannelNotFound, params));
    //   }
    //   aliceIdentifier = channel.aliceIdentifier;
    //   bobIdentifier = channel.bobIdentifier;
    // }
    // const isAlice = this.publicIdentifier === aliceIdentifier;
    // const counterpartyIdentifier = isAlice ? bobIdentifier : aliceIdentifier;
    throw new Error("must implement internal queueing");
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
        const receivedError = this.validateParamSchema(received.update, TChannelUpdate);
        if (receivedError) {
          this.logger.warn(
            { method, methodId, update: received.update, error: jsonifyError(receivedError) },
            "Received malformed proposed update",
          );
          return;
        }
        // Previous update may be undefined, but if it exists, validate
        const previousError = this.validateParamSchema(received.previousUpdate, TChannelUpdate);
        if (previousError && received.previousUpdate) {
          this.logger.warn(
            { method, methodId, update: received.previousUpdate, error: jsonifyError(previousError) },
            "Received malformed previous update",
          );
          return;
        }

        if (received.update.fromIdentifier === this.publicIdentifier) {
          this.logger.debug({ method, methodId }, "Received update from ourselves, doing nothing");
          return;
        }

        // Update has been received and is properly formatted. Before
        // applying the update, make sure it is the highest seen nonce
        const highestChannelNonce = this.highestNonce[received.update.channelAddress] ?? 0;
        if (highestChannelNonce > received.update.nonce) {
          this.logger.debug(
            { method, methodId, highestChannelNonce, updateNonce: received.update.nonce },
            "Not processing update below highest nonce",
          );
          return;
        }

        if (highestChannelNonce === received.update.nonce) {
          // In this case, you should be expecting to receive a double
          // signed state for what youve proposed. This should be handled
          // by the return value of `messaging.sendProtocolMessage` so
          // it is safe to return out of the handler here.
          return;
        }

        // Now you are only receiving an update that is *greater* than
        // one you have seen. This means you have a couple options:
        // (1) you are not processing any update currently, apply the
        //     proposed update to your state and respond
        // (2) you are currently processing an update at a lower nonce:
        //     (a) received update includes the update you proposed,
        //         validate the received update and return double signed
        //         while discarding your proposed update
        //     (b) received update doesnt include update you proposed,
        //         validate the received update, and repropose your
        //         update at the top of the queue

        // First, update the highest seen nonce
        this.highestNonce[received.update.channelAddress] = received.update.nonce;

        // Apply the update at the higher nonce
        const params = getParamsFromUpdate(received.update);
        if (params.isError) {
          // TODO: respond here so initiator doesnt just time out
          this.logger.warn(
            { method, methodId, error: jsonifyError(params.getError()!) },
            "Could not get params from update",
          );
          return;
        }
        const result = await this.addToQueue(params.getValue(), received.previousUpdate);
        if (result.isError) {
          this.logger.warn({ method, methodId, error: jsonifyError(result.getError()!) }, "Failed to apply update");
          // reset to previous nonce here while nonces cant be burned
          // TODO: implement burned nonces
          this.highestNonce[received.update.channelAddress] = highestChannelNonce;
          return;
        }

        const { updatedChannel, updatedActiveTransfers, updatedTransfer } = result.getValue();

        this.evts[ProtocolEventName.CHANNEL_UPDATE_EVENT].post({
          updatedChannelState: updatedChannel,
          updatedTransfers: updatedActiveTransfers,
          updatedTransfer,
        });
        this.logger.debug({ method, methodId, channelNonce: updatedChannel.nonce }, "Applied received update");

        // Check if you are currently proposing an update
        const proposed = this.inProgressUpdate[received.update.channelAddress];

        // If no, return
        if (!proposed) {
          return;
        }

        // If so, check if the update includes our proposed update
        const proposedTransfer =
          proposed.type === UpdateType.create ? getTransferFromUpdate(proposed, updatedChannel) : undefined;
        const included = this.includesOurProposedUpdate(
          received.update,
          proposed,
          // TODO: make it *always* return updatedActiveTransfers
          updatedActiveTransfers!,
          proposedTransfer,
        );

        // If it does include our proposed update, add inbound to the
        // queue and remove currently processing update
        if (!included.isError && included.getValue()) {
          // Remove the proposed update from our tracker
          this.inProgressUpdate[received.update.channelAddress] = undefined;
          this.logger.debug(
            { method, methodId, channelNonce: updatedChannel.nonce },
            "Proposed update included, not regenerating",
          );
          // TODO: resume queue without inserting update
          this.logger.debug({ method, methodId }, "Method complete");
          return;
        }

        // There is a case here where included is an error, in which
        // case you should retry the proposed update anyway (errors
        // should fall through to validation)

        // If it does not, insert previously in progress update
        // at the front of queue
        const regenerated = getParamsFromUpdate(proposed);
        if (regenerated.isError) {
          return;
        }
        const processedResult = await this.addToFrontOfQueue(regenerated.getValue(), received.update);
        if (processedResult.isError) {
          this.logger.error({ ...jsonifyError(processedResult.getError()!) }, "Failed to apply proposed update");
        }
        this.logger.debug({ methodId, method }, "Method complete");
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

  private validateParamSchema(params: any, schema: any): undefined | OutboundChannelUpdateError {
    const error = validateSchema(params, schema);
    if (error) {
      return new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.InvalidParams, params, undefined, {
        paramsError: error,
      });
    }
    return undefined;
  }

  // Adds a given task to the internal queue
  // TODO: implement
  private addToQueue(
    params: UpdateParams<any>,
    previous?: ChannelUpdate,
  ): Promise<
    Result<
      {
        updatedChannel: FullChannelState;
        updatedActiveTransfers?: FullTransferState[];
        updatedTransfer?: FullTransferState;
      },
      QueuedUpdateError
    >
  > {
    throw new Error("addToQueue method not implemented");
  }

  // Adds a given task to the front of the internal queue
  // TODO: implement
  private addToFrontOfQueue(
    params: UpdateParams<any>,
    previous?: ChannelUpdate,
  ): Promise<
    Result<
      {
        updatedChannel: FullChannelState;
        updatedActiveTransfers?: FullTransferState[];
        updatedTransfer?: FullTransferState;
      },
      QueuedUpdateError
    >
  > {
    throw new Error("addToQueue method not implemented");
  }

  /**
   * Returns true if the received upddate includes our proposed update. If true,
   * this means you don't have to re-send your proposed update. If false, this
   * means you should resend your proposed upddate
   * @param receivedUpdate The update you have gotten from your counterparty
   * @param proposedUpdate The update you have sent out to counterparty
   */
  private includesOurProposedUpdate(
    receivedUpdate: ChannelUpdate,
    proposedUpdate: ChannelUpdate,
    // TODO: should probably just use the generated merkle tree here instead
    // of regenerating it from the transfers and channel
    updatedActiveTransfers: FullTransferState[],
    proposedTransfer?: FullTransferState,
  ): Result<boolean, QueuedUpdateError> {
    // If both are a setup update, your update would fail and the ultimate
    // result (a channel is set up) is achieved
    if (receivedUpdate.type === UpdateType.setup && proposedUpdate.type === UpdateType.setup) {
      return Result.ok(true);
    }

    // If both are a deposit update, your deposit is implicitly included
    if (receivedUpdate.type === UpdateType.deposit && proposedUpdate.type === UpdateType.deposit) {
      return Result.ok(true);
    }

    // If both are a resolve, it would *not* include your proposed update since
    // only the responder to a transfer can call resolve. Updates by definition
    // are different
    if (receivedUpdate.type === UpdateType.resolve && proposedUpdate.type === UpdateType.resolve) {
      return Result.ok(false);
    }

    // If both are a create, it would include your proposed update IFF the
    // merkle root *after* the update was applied includes the transfer you
    // attempted to create
    if (receivedUpdate.type === UpdateType.create && proposedUpdate.type === UpdateType.create) {
      if (!proposedTransfer) {
        return Result.fail(
          new QueuedUpdateError(QueuedUpdateError.reasons.MissingTransferForUpdateInclusion, {
            proposedUpdate,
            receivedUpdate,
          }),
        );
      }
      const { tree, root, proof } = generateMerkleTreeData(updatedActiveTransfers, proposedTransfer);
      const included = tree.verify(proof!, bufferify(hashCoreTransferState(proposedTransfer)), root);
      return Result.ok(included);
    }

    // Otherwise, updates are different types so it does not include your
    // proposed update
    return Result.ok(false);
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

  public async setup(params: ProtocolParams.Setup): Promise<Result<FullChannelState, OutboundChannelUpdateError>> {
    const method = "setup";
    const methodId = getRandomBytes32();
    this.logger.debug({ method, methodId }, "Method start");
    // Validate all parameters
    const error = this.validateParamSchema(params, ProtocolParams.SetupSchema);
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
        new OutboundChannelUpdateError(
          OutboundChannelUpdateError.reasons.Create2Failed,
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
  public async deposit(params: ProtocolParams.Deposit): Promise<Result<FullChannelState, OutboundChannelUpdateError>> {
    const method = "deposit";
    const methodId = getRandomBytes32();
    this.logger.debug({ method, methodId }, "Method start");
    // Validate all input
    const error = this.validateParamSchema(params, ProtocolParams.DepositSchema);
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

  public async create(params: ProtocolParams.Create): Promise<Result<FullChannelState, OutboundChannelUpdateError>> {
    const method = "create";
    const methodId = getRandomBytes32();
    this.logger.debug({ method, methodId }, "Method start");
    // Validate all input
    const error = this.validateParamSchema(params, ProtocolParams.CreateSchema);
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

  public async resolve(params: ProtocolParams.Resolve): Promise<Result<FullChannelState, OutboundChannelUpdateError>> {
    const method = "resolve";
    const methodId = getRandomBytes32();
    this.logger.debug({ method, methodId }, "Method start");
    // Validate all input
    const error = this.validateParamSchema(params, ProtocolParams.ResolveSchema);
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
