import {
  EngineEvent,
  EngineEventMap,
  INodeService,
  Result,
  ServerNodeParams,
  ServerNodeResponses,
  NodeError,
  OptionalPublicIdentifier,
} from "@connext/vector-types";
import Ajv from "ajv";
import Axios from "axios";
import { Evt, VoidCtx } from "evt";
import { BaseLogger } from "pino";

const ajv = new Ajv();

export type EventCallbackConfig = {
  [event in keyof EngineEventMap]: {
    evt?: Evt<EngineEventMap[event]>;
    url?: string;
  };
};

// Holds all the contexts for each public identifier
type ContextContainer = {
  [publicIdentifier: string]: VoidCtx;
};

export class RestServerNodeService implements INodeService {
  public publicIdentifier = "";
  public signerAddress = "";

  private readonly ctxs: ContextContainer = {};

  private constructor(
    private readonly serverNodeUrl: string,
    private readonly logger: BaseLogger,
    private readonly evts?: EventCallbackConfig,
  ) {}

  static async connect(
    serverNodeUrl: string,
    logger: BaseLogger,
    evts?: EventCallbackConfig,
    index?: number,
  ): Promise<RestServerNodeService> {
    const service = new RestServerNodeService(serverNodeUrl, logger, evts);
    // If an index is provided, the service will only host a single engine
    // and the publicIdentifier will be automatically included in parameters
    if (index !== undefined || index !== null) {
      // Create the public identifier and signer address
      const node = await service.createNode({ index });
      if (node.isError) {
        logger.error({ error: node.getError()!.message, method: "connect" }, "Failed to create node");
        throw node.getError();
      }
      const { publicIdentifier, signerAddress } = node.getValue();
      service.publicIdentifier = publicIdentifier;
      service.signerAddress = signerAddress;
    }

    return service;
  }

  async getConfig(): Promise<Result<ServerNodeResponses.GetConfig, NodeError>> {
    return this.executeHttpRequest("config", "get", {}, ServerNodeParams.GetConfigSchema);
  }

  async createNode(params: ServerNodeParams.CreateNode): Promise<Result<ServerNodeResponses.CreateNode, NodeError>> {
    const res = await this.executeHttpRequest<ServerNodeResponses.CreateNode>(
      `node`,
      "post",
      params,
      ServerNodeParams.CreateNodeSchema,
    );
    if (res.isError) {
      return res;
    }
    if (this.evts) {
      const urls = Object.fromEntries(
        Object.entries(this.evts).map(([event, config]) => {
          return [event, config.url ?? ""];
        }),
      );
      const { publicIdentifier } = res.getValue();
      // Create an evt context for this public identifier only
      // (see not in `off`)
      this.ctxs[publicIdentifier] = Evt.newCtx();
      const params: ServerNodeParams.RegisterListener = {
        events: urls,
        publicIdentifier: publicIdentifier ?? this.publicIdentifier,
      };
      // IFF the public identifier is undefined, it should be overridden by
      // the pubId defined in the parameters.
      const subscription = await this.executeHttpRequest(
        `event/subscribe`,
        "post",
        params,
        ServerNodeParams.RegisterListenerSchema,
      );
      if (subscription.isError) {
        this.logger.error({ error: subscription.getError()! }, "Failed to create subscription");
        return Result.fail(subscription.getError()!);
      }
      this.logger.info({ urls, method: "connect" }, "Engine event subscription created");
    }
    return res;
  }

  async getStateChannel(
    params: OptionalPublicIdentifier<ServerNodeParams.GetChannelState>,
  ): Promise<Result<ServerNodeResponses.GetChannelState, NodeError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/channels/${params.channelAddress}`,
      "get",
      params,
      ServerNodeParams.GetChannelStateSchema,
    );
  }

  async getStateChannels(
    params: OptionalPublicIdentifier<ServerNodeParams.GetChannelStates>,
  ): Promise<Result<ServerNodeResponses.GetChannelStates, NodeError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/channels`,
      "get",
      params,
      ServerNodeParams.GetChannelStatesSchema,
    );
  }

  async getTransfersByRoutingId(
    params: OptionalPublicIdentifier<ServerNodeParams.GetTransferStatesByRoutingId>,
  ): Promise<Result<ServerNodeResponses.GetTransferStatesByRoutingId, NodeError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/transfers/routing-id/${params.routingId}`,
      "get",
      params,
      ServerNodeParams.GetTransferStatesByRoutingIdSchema,
    );
  }

  async getTransferByRoutingId(
    params: OptionalPublicIdentifier<ServerNodeParams.GetTransferStateByRoutingId>,
  ): Promise<Result<ServerNodeResponses.GetTransferStateByRoutingId, NodeError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/channels/${params.channelAddress}/transfers/routing-id/${
        params.routingId
      }`,
      "get",
      params,
      ServerNodeParams.GetTransferStateByRoutingIdSchema,
    );
  }

  async getTransfer(
    params: OptionalPublicIdentifier<ServerNodeParams.GetTransferState>,
  ): Promise<Result<ServerNodeResponses.GetTransferState, NodeError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/transfers/${params.transferId}`,
      "get",
      params,
      ServerNodeParams.GetTransferStateSchema,
    );
  }

  async getActiveTransfers(
    params: OptionalPublicIdentifier<ServerNodeParams.GetActiveTransfersByChannelAddress>,
  ): Promise<Result<ServerNodeResponses.GetActiveTransfersByChannelAddress, NodeError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/channels/${params.channelAddress}/active-transfers`,
      "get",
      params,
      ServerNodeParams.GetActiveTransfersByChannelAddressSchema,
    );
  }

  async getStateChannelByParticipants(
    params: OptionalPublicIdentifier<ServerNodeParams.GetChannelStateByParticipants>,
  ): Promise<Result<ServerNodeResponses.GetChannelStateByParticipants, NodeError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/channels/counterparty/${params.counterparty}/chain-id/${
        params.chainId
      }`,
      "get",
      params,
      ServerNodeParams.GetChannelStateByParticipantsSchema,
    );
  }

  async requestSetup(
    params: Omit<ServerNodeParams.RequestSetup, "bobIdentifier"> & { bobIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.RequestSetup, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.RequestSetup>(
      "request-setup",
      "post",
      params,
      ServerNodeParams.RequestSetupSchema,
    );
  }

  async setup(
    params: OptionalPublicIdentifier<ServerNodeParams.Setup>,
  ): Promise<Result<ServerNodeResponses.Setup, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.Setup>("setup", "post", params, ServerNodeParams.SetupSchema);
  }

  async sendDepositTx(
    params: OptionalPublicIdentifier<ServerNodeParams.SendDepositTx>,
  ): Promise<Result<ServerNodeResponses.SendDepositTx, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.SendDepositTx>(
      "send-deposit-tx",
      "post",
      params,
      ServerNodeParams.SendDepositTxSchema,
    );
  }

  async reconcileDeposit(
    params: OptionalPublicIdentifier<ServerNodeParams.Deposit>,
  ): Promise<Result<ServerNodeResponses.Deposit, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.Deposit>(
      "deposit",
      "post",
      {
        channelAddress: params.channelAddress,
        assetId: params.assetId,
        publicIdentifier: params.publicIdentifier,
      },
      ServerNodeParams.DepositSchema,
    );
  }

  async requestCollateral(
    params: OptionalPublicIdentifier<ServerNodeParams.RequestCollateral>,
  ): Promise<Result<ServerNodeResponses.RequestCollateral, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.RequestCollateral>(
      "request-collateral",
      "post",
      params,
      ServerNodeParams.RequestCollateralSchema,
    );
  }

  async conditionalTransfer(
    params: OptionalPublicIdentifier<ServerNodeParams.ConditionalTransfer>,
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.ConditionalTransfer>(
      `transfers/create`,
      "post",
      params,
      ServerNodeParams.ConditionalTransferSchema,
    );
  }

  async resolveTransfer(
    params: OptionalPublicIdentifier<ServerNodeParams.ResolveTransfer>,
  ): Promise<Result<ServerNodeResponses.ResolveTransfer, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.ResolveTransfer>(
      `transfers/resolve`,
      "post",
      params,
      ServerNodeParams.ResolveTransferSchema,
    );
  }

  async withdraw(
    params: OptionalPublicIdentifier<ServerNodeParams.Withdraw>,
  ): Promise<Result<ServerNodeResponses.Withdraw, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.Withdraw>(
      `withdraw`,
      "post",
      params,
      ServerNodeParams.WithdrawSchema,
    );
  }

  public once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter: (payload: EngineEventMap[T]) => boolean = () => true,
    publicIdentifier?: string,
  ): void {
    if (!this.evts || !this.evts[event]?.evt) {
      throw new NodeError(NodeError.reasons.NoEvts, { event });
    }
    const pubId = publicIdentifier ?? this.publicIdentifier;
    if (!pubId) {
      throw new NodeError(NodeError.reasons.NoPublicIdentifier);
    }
    const ctx = this.ctxs[publicIdentifier ?? this.publicIdentifier];
    this.evts[event].evt
      .pipe(ctx)
      .pipe((data: EngineEventMap[T]) => {
        const filtered = filter(data);
        return filtered && (data.aliceIdentifier === pubId || data.bobIdentifier === pubId);
      })
      .attachOnce(callback);
  }

  public on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter: (payload: EngineEventMap[T]) => boolean = () => true,
    publicIdentifier?: string,
  ): void {
    if (!this.evts || !this.evts[event]?.evt) {
      throw new NodeError(NodeError.reasons.NoEvts, { event });
    }
    const pubId = publicIdentifier ?? this.publicIdentifier;
    if (!pubId) {
      throw new NodeError(NodeError.reasons.NoPublicIdentifier);
    }
    const ctx = this.ctxs[pubId];
    this.evts[event].evt
      .pipe(ctx)
      .pipe((data: EngineEventMap[T]) => {
        const filtered = filter(data);
        return filtered && (data.aliceIdentifier === pubId || data.bobIdentifier === pubId);
      })
      .attach(callback);
  }

  public waitFor<T extends EngineEvent>(
    event: T,
    timeout: number,
    filter: (payload: EngineEventMap[T]) => boolean = () => true,
    publicIdentifier?: string,
  ): Promise<EngineEventMap[T] | undefined> {
    if (!this.evts || !this.evts[event]?.evt) {
      throw new NodeError(NodeError.reasons.NoEvts, { event });
    }
    const pubId = publicIdentifier ?? this.publicIdentifier;
    if (!pubId) {
      throw new NodeError(NodeError.reasons.NoPublicIdentifier);
    }
    const ctx = this.ctxs[pubId];
    return this.evts[event].evt
      .pipe(ctx)
      .pipe((data: EngineEventMap[T]) => {
        const filtered = filter(data);
        return filtered && (data.aliceIdentifier === pubId || data.bobIdentifier === pubId);
      })
      .waitFor(timeout) as Promise<EngineEventMap[T]>;
  }

  public off<T extends EngineEvent>(event: T, publicIdentifier?: string): void {
    if (!this.evts || !this.evts[event]?.evt) {
      throw new NodeError(NodeError.reasons.NoEvts, { event });
    }
    if (!publicIdentifier && !this.publicIdentifier) {
      throw new NodeError(NodeError.reasons.NoPublicIdentifier);
    }
    const ctx = this.ctxs[publicIdentifier ?? this.publicIdentifier];
    ctx.done();
  }

  // Helper methods
  private async executeHttpRequest<U>(
    urlPath: string,
    method: "get" | "post",
    params: any,
    paramSchema: any,
  ): Promise<Result<U, NodeError>> {
    const url = `${this.serverNodeUrl}/${urlPath}`;
    // Validate parameters are in line with schema
    const validate = ajv.compile(paramSchema);
    // IFF the public identifier is undefined, it should be overridden by
    // the pubId defined in the parameters.
    const filled = { publicIdentifier: this.publicIdentifier, ...params };
    if (!validate(filled)) {
      return Result.fail(
        new NodeError(NodeError.reasons.InvalidParams, {
          errors: validate.errors?.map(err => err.message).join(","),
        }),
      );
    }

    // Attempt request
    try {
      const res = method === "get" ? await Axios.get(url) : await Axios.post(url, filled);
      return Result.ok(res.data);
    } catch (e) {
      const jsonErr = Object.keys(e).includes("toJSON") ? e.toJSON() : e;
      return Result.fail(
        new NodeError(jsonErr.message ?? NodeError.reasons.InternalServerError, { stack: jsonErr.stack, filled, url }),
      );
    }
  }
}
