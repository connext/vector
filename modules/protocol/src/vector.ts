import {
  ChannelUpdate,
  ChannelUpdateEvent,
  FullChannelState,
  FullTransferState,
  IChannelSigner,
  IExternalValidation,
  ILockService,
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
import { getCreate2MultisigAddress, getRandomBytes32 } from "@connext/vector-utils";
import { Evt } from "evt";
import pino from "pino";

import { OutboundChannelUpdateError } from "./errors";
import * as sync from "./sync";
import { validateSchema } from "./utils";

type EvtContainer = { [K in keyof ProtocolEventPayloadsMap]: Evt<ProtocolEventPayloadsMap[K]> };

export class Vector implements IVectorProtocol {
  private evts: EvtContainer = {
    [ProtocolEventName.CHANNEL_UPDATE_EVENT]: Evt.create<ChannelUpdateEvent>(),
  };

  // make it private so the only way to create the class is to use `connect`
  private constructor(
    private readonly messagingService: IMessagingService,
    private readonly lockService: ILockService,
    private readonly storeService: IVectorStore,
    private readonly signer: IChannelSigner,
    private readonly chainReader: IVectorChainReader,
    private readonly externalValidationService: IExternalValidation,
    private readonly logger: pino.BaseLogger,
    private readonly skipCheckIn: boolean,
  ) {}

  static async connect(
    messagingService: IMessagingService,
    lockService: ILockService,
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
      lockService,
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

  // separate out this function so that we can atomically return and release the lock
  private async lockedOperation(
    params: UpdateParams<any>,
  ): Promise<Result<FullChannelState, OutboundChannelUpdateError>> {
    // Send the update to counterparty
    const outboundRes = await sync.outbound(
      params,
      this.storeService,
      this.chainReader,
      this.messagingService,
      this.externalValidationService,
      this.signer,
      this.logger,
    );
    if (outboundRes.isError) {
      this.logger.error({
        method: "lockedOperation",
        variable: "outboundRes",
        error: jsonifyError(outboundRes.getError()!),
      });
      return outboundRes as Result<any, OutboundChannelUpdateError>;
    }
    // Post to channel update evt
    const { updatedChannel, updatedTransfers, updatedTransfer } = outboundRes.getValue();
    this.evts[ProtocolEventName.CHANNEL_UPDATE_EVENT].post({
      updatedChannelState: updatedChannel,
      updatedTransfers,
      updatedTransfer,
    });
    return Result.ok(outboundRes.getValue().updatedChannel);
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
    let aliceIdentifier: string;
    let bobIdentifier: string;
    let channel: FullChannelState | undefined;
    if (params.type === UpdateType.setup) {
      aliceIdentifier = this.publicIdentifier;
      bobIdentifier = (params as UpdateParams<"setup">).details.counterpartyIdentifier;
    } else {
      channel = await this.storeService.getChannelState(params.channelAddress);
      if (!channel) {
        return Result.fail(new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.ChannelNotFound, params));
      }
      aliceIdentifier = channel.aliceIdentifier;
      bobIdentifier = channel.bobIdentifier;
    }
    const isAlice = this.publicIdentifier === aliceIdentifier;
    const counterpartyIdentifier = isAlice ? bobIdentifier : aliceIdentifier;
    let key: string;
    try {
      key = await this.lockService.acquireLock(params.channelAddress, isAlice, counterpartyIdentifier);
    } catch (e) {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.AcquireLockFailed, params, channel, {
          lockError: e.message,
        }),
      );
    }
    const outboundRes = await this.lockedOperation(params);
    try {
      await this.lockService.releaseLock(params.channelAddress, key, isAlice, counterpartyIdentifier);
    } catch (e) {
      // lock errors should not cause downstream errors because the lock
      // will time out eventually and the update has been saved
      this.logger.error({ method, methodId, error: jsonifyError(e) }, "Lock release failed, update is saved.");
    }

    return outboundRes;
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

        // validate and save
        const inboundRes = await sync.inbound(
          received.update,
          received.previousUpdate,
          inbox,
          this.chainReader,
          this.storeService,
          this.messagingService,
          this.externalValidationService,
          this.signer,
          this.logger,
        );
        if (inboundRes.isError) {
          this.logger.warn(
            { method, methodId, error: jsonifyError(inboundRes.getError()!) },
            "Failed to apply inbound update",
          );
          return;
        }

        const { updatedChannel, updatedActiveTransfers, updatedTransfer } = inboundRes.getValue();

        this.evts[ProtocolEventName.CHANNEL_UPDATE_EVENT].post({
          updatedChannelState: updatedChannel,
          updatedTransfers: updatedActiveTransfers,
          updatedTransfer: updatedTransfer,
        });
        this.logger.debug({ method, methodId }, "Method complete");
      },
    );

    // sync latest state before starting
    // TODO: skipping this, if it works, consider just not awaiting the promise so the rest of startup can continue
    if (!this.skipCheckIn) {
      const channels = await this.storeService.getChannelStates();

      // Handle disputes
      // First check on current dispute status of all channels onchain
      // Since we have no way of knowing the last time the protocol
      // connected, we must check this on startup
      // TODO: is there a better way to do this?
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
          const dispute = disputeRes.getValue();
          if (!dispute) {
            return;
          }
          try {
            // save dispute record
            // TODO: implement recovery from dispute
            await this.storeService.saveChannelDispute({ ...channel, inDispute: true }, dispute);
          } catch (e) {
            this.logger.error(
              { channelAddress: channel.channelAddress, error: e.message },
              "Failed to update dispute on startup",
            );
          }
        }),
      );
    } else {
      this.logger.warn("Skipping checking disputes because of skipCheckIn config");
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
}
