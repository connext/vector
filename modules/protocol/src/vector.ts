import { ChannelFactory } from "@connext/vector-contracts";
import {
  IVectorStore,
  UpdateParams,
  DepositParams,
  UpdateType,
  CreateTransferParams,
  ResolveTransferParams,
  ILockService,
  IMessagingService,
  IChannelSigner,
  FullChannelState,
  ChannelUpdateEvent,
  ProtocolEventName,
  ProtocolEventPayloadsMap,
  IVectorProtocol,
  Result,
  ChannelUpdateError,
  VectorMessage,
  SetupParams,
  FullTransferState,
  IVectorOnchainService,
} from "@connext/vector-types";
import { getSignerAddressFromPublicIdentifier, getCreate2MultisigAddress } from "@connext/vector-utils";
import Ajv from "ajv";
import { Evt } from "evt";
import pino from "pino";

import * as sync from "./sync";
import { CreateParamsSchema, DepositParamsSchema, ResolveParamsSchema, SetupParamsSchema } from "./types";
import { generateUpdate } from "./update";

type EvtContainer = { [K in keyof ProtocolEventPayloadsMap]: Evt<ProtocolEventPayloadsMap[K]> };

const ajv = new Ajv();

export class Vector implements IVectorProtocol {
  private evts: EvtContainer = {
    [ProtocolEventName.CHANNEL_UPDATE_EVENT]: Evt.create<ChannelUpdateEvent>(),
    [ProtocolEventName.PROTOCOL_ERROR_EVENT]: Evt.create<ChannelUpdateError>(),
    [ProtocolEventName.PROTOCOL_MESSAGE_EVENT]: Evt.create<FullChannelState>(),
  };

  // make it private so the only way to create the class is to use `connect`
  private constructor(
    private readonly messagingService: IMessagingService,
    private readonly lockService: ILockService,
    private readonly storeService: IVectorStore,
    private readonly signer: IChannelSigner,
    private readonly onchainService: IVectorOnchainService,
    private readonly logger: pino.BaseLogger,
  ) {}

  static async connect(
    messagingService: IMessagingService,
    lockService: ILockService,
    storeService: IVectorStore,
    signer: IChannelSigner,
    onchainService: IVectorOnchainService,
    logger: pino.BaseLogger,
  ): Promise<Vector> {
    const node = new Vector(messagingService, lockService, storeService, signer, onchainService, logger);

    // Handles up asynchronous services and checks to see that
    // channel is `setup` plus is not in dispute
    await node.setupServices();
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
  private async lockedOperation(params: UpdateParams<any>): Promise<Result<FullChannelState, ChannelUpdateError>> {
    const state = await this.storeService.getChannelState(params.channelAddress);

    // Generate the update
    const updateRes = await generateUpdate(
      params,
      state,
      this.storeService,
      this.onchainService,
      this.signer,
      this.logger,
    );
    if (updateRes.isError) {
      this.logger.error({ method: "lockedOperation", variable: "updateRes", error: updateRes.getError()?.message });
      return Result.fail(updateRes.getError()!);
    }
    const outboundRes = await sync.outbound(
      updateRes.getValue(),
      state,
      this.storeService,
      this.messagingService,
      this.signer,
      this.evts[ProtocolEventName.PROTOCOL_MESSAGE_EVENT],
      this.evts[ProtocolEventName.PROTOCOL_ERROR_EVENT],
      this.logger,
    );

    if (outboundRes.isError) {
      this.logger.error({ method: "lockedOperation", variable: "outboundRes", error: outboundRes.getError()?.message });
      return outboundRes;
    }

    const updatedChannelState = outboundRes.getValue();
    this.evts[ProtocolEventName.CHANNEL_UPDATE_EVENT].post({
      updatedChannelState,
    });

    return outboundRes;
  }

  // Primary protocol execution from the leader side
  private async executeUpdate(params: UpdateParams<any>): Promise<Result<FullChannelState, ChannelUpdateError>> {
    this.logger.info({ method: "executeUpdate", step: "start", params });

    const key = await this.lockService.acquireLock(params.channelAddress);
    const outboundRes = this.lockedOperation(params);
    await this.lockService.releaseLock(params.channelAddress, key);

    return outboundRes;
  }

  private async setupServices(): Promise<Vector> {
    this.messagingService.onReceive(this.publicIdentifier, async (msg: VectorMessage) => {
      this.logger.info({ method: "onReceive", step: "Received inbound", msg });
      const inboundRes = await sync.inbound(
        msg,
        this.storeService,
        this.messagingService,
        this.signer,
        this.evts[ProtocolEventName.PROTOCOL_MESSAGE_EVENT],
        this.evts[ProtocolEventName.PROTOCOL_ERROR_EVENT],
        this.logger,
      );
      if (inboundRes.isError) {
        this.logger.error({ method: "inbound", error: inboundRes.getError()?.message });
      }
      const updatedChannelState = inboundRes.getValue();
      this.evts[ProtocolEventName.CHANNEL_UPDATE_EVENT].post({
        updatedChannelState: updatedChannelState!,
      });
    });

    // TODO run setup updates if the channel is not already setup

    // TODO validate that the channel is not currently in dispute/checkpoint state

    // sync latest state before starting
    const channels = await this.storeService.getChannelStates();
    await Promise.all(
      channels.map((channel) => {
        return new Promise((resolve) => {
          try {
            sync
              .outbound(
                channel.latestUpdate,
                channel,
                this.storeService,
                this.messagingService,
                this.signer,
                this.evts[ProtocolEventName.PROTOCOL_MESSAGE_EVENT],
                this.evts[ProtocolEventName.PROTOCOL_ERROR_EVENT],
                this.logger,
              )
              .then(resolve);
          } catch (e) {
            this.logger.error(`Failed to sync channel`, { channel: channel.channelAddress });
            resolve(undefined);
          }
        });
      }),
    );
    return this;
  }

  private validateParams(params: any, schema: any): undefined | ChannelUpdateError {
    const validate = ajv.compile(schema);
    const valid = validate(params);
    if (!valid) {
      return new ChannelUpdateError(ChannelUpdateError.reasons.InvalidParams, undefined, undefined, {
        errors: validate.errors?.map((e) => e.message).join(),
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

  public async setup(params: SetupParams): Promise<Result<FullChannelState, ChannelUpdateError>> {
    // Validate all parameters
    const error = this.validateParams(params, SetupParamsSchema);
    if (error) {
      this.logger.error({ method: "setup", params, error });
      return Result.fail(error);
    }

    // TODO: move to within lock!
    const existing = await this.storeService.getChannelStateByParticipants(
      this.signerAddress,
      getSignerAddressFromPublicIdentifier(params.counterpartyIdentifier),
      params.networkContext.chainId,
    );
    if (existing) {
      // TODO: should this return an error here, or simply the already setup
      // channel?
      return Result.ok(existing);
    }

    const create2Res = await getCreate2MultisigAddress(
      this.publicIdentifier,
      params.counterpartyIdentifier,
      params.networkContext.chainId,
      params.networkContext.channelFactoryAddress,
      params.networkContext.vectorChannelMastercopyAddress,
      this.onchainService,
    );
    if (create2Res.isError) {
      return Result.fail(
        new ChannelUpdateError(ChannelUpdateError.reasons.Create2Failed, undefined, undefined, {
          error: create2Res.getError()!.message,
        }),
      );
    }
    const channelAddress = create2Res.getValue();

    // Convert the API input to proper UpdateParam format
    const updateParams: UpdateParams<"setup"> = {
      channelAddress,
      details: params,
      type: UpdateType.setup,
    };

    return this.executeUpdate(updateParams);
  }

  // Adds a deposit that has *already occurred* onchain into the multisig
  public async deposit(params: DepositParams): Promise<Result<FullChannelState, ChannelUpdateError>> {
    // Validate all input
    const error = this.validateParams(params, DepositParamsSchema);
    if (error) {
      return Result.fail(error);
    }

    // Convert the API input to proper UpdateParam format
    const updateParams: UpdateParams<"deposit"> = {
      channelAddress: params.channelAddress,
      type: UpdateType.deposit,
      details: params,
    };

    return this.executeUpdate(updateParams);
  }

  public async create(params: CreateTransferParams): Promise<Result<FullChannelState, ChannelUpdateError>> {
    // Validate all input
    const error = this.validateParams(params, CreateParamsSchema);
    if (error) {
      return Result.fail(error);
    }

    // Convert the API input to proper UpdateParam format
    const updateParams: UpdateParams<"create"> = {
      channelAddress: params.channelAddress,
      type: UpdateType.create,
      details: params,
    };

    return this.executeUpdate(updateParams);
  }

  public async resolve(params: ResolveTransferParams): Promise<Result<FullChannelState, ChannelUpdateError>> {
    // Validate all input
    const error = this.validateParams(params, ResolveParamsSchema);
    if (error) {
      return Result.fail(error);
    }

    // Convert the API input to proper UpdateParam format
    const updateParams: UpdateParams<"resolve"> = {
      channelAddress: params.channelAddress,
      type: UpdateType.resolve,
      details: params,
    };

    return this.executeUpdate(updateParams);
  }

  ///////////////////////////////////
  // STORE METHODS
  public async getChannelState(channelAddress: string): Promise<FullChannelState | undefined> {
    return this.storeService.getChannelState(channelAddress);
  }

  public async getTransferState(transferId: string): Promise<FullTransferState | undefined> {
    return this.storeService.getTransferState(transferId);
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

  public off<T extends ProtocolEventName>(event?: T): void {
    if (event) {
      this.evts[event].detach();
      return;
    }

    Object.keys(ProtocolEventName).forEach((k) => this.evts[k].detach());
  }
}
