import {
  EngineEvent,
  EngineEventMap,
  INodeService,
  Result,
  NodeParams,
  NodeResponses,
  OptionalPublicIdentifier,
  Values,
  NodeError,
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

export type ServerNodeServiceErrorContext = NodeError & {
  requestUrl: string;
  publicIdentifier: string;
  params: any;
};
export class ServerNodeServiceError extends NodeError {
  static readonly type = "ServerNodeServiceError";

  static readonly reasons = {
    InternalServerError: "Failed to send request",
    InvalidParams: "Request has invalid parameters",
    MultinodeProhibitted: "Not allowed to have multiple nodes",
    NoEvts: "No evts for event",
    NoPublicIdentifier: "Public identifier not supplied, and no default identifier",
    Timeout: "Timeout",
  } as const;

  readonly context: ServerNodeServiceErrorContext;

  constructor(
    public readonly msg: Values<typeof ServerNodeServiceError.reasons>,
    publicIdentifier: string,
    requestUrl: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    params: any,
    context: any = {},
  ) {
    super(msg, { requestUrl, publicIdentifier, params, ...context });
  }
}

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
    skipCheckIn?: boolean,
  ): Promise<RestServerNodeService> {
    const service = new RestServerNodeService(serverNodeUrl, logger, evts);
    // If an index is provided, the service will only host a single engine
    // and the publicIdentifier will be automatically included in parameters
    if (typeof index === "number") {
      // Create the public identifier and signer address
      const node = await service.createNode({ index, skipCheckIn });
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

  getStatus(publicIdentifer?: string): Promise<Result<NodeResponses.GetStatus, ServerNodeServiceError>> {
    return this.executeHttpRequest(
      `${publicIdentifer ?? this.publicIdentifier}/status`,
      "get",
      {},
      NodeParams.GetConfigSchema,
    );
  }

  getRouterConfig(
    params: OptionalPublicIdentifier<NodeParams.GetRouterConfig>,
  ): Promise<Result<NodeResponses.GetRouterConfig, ServerNodeServiceError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/router/config/${params.routerIdentifier}`,
      "get",
      params,
      NodeParams.GetRouterConfigSchema,
    );
  }

  async getConfig(): Promise<Result<NodeResponses.GetConfig, ServerNodeServiceError>> {
    return this.executeHttpRequest("config", "get", {}, NodeParams.GetConfigSchema);
  }

  sendDisputeChannelTx(
    params: OptionalPublicIdentifier<NodeParams.SendDisputeChannelTx>,
  ): Promise<Result<NodeResponses.SendDisputeChannelTx, ServerNodeServiceError>> {
    return this.executeHttpRequest(`send-dispute-channel-tx`, "post", params, NodeParams.SendDisputeChannelTxSchema);
  }

  sendDefundChannelTx(
    params: OptionalPublicIdentifier<NodeParams.SendDefundChannelTx>,
  ): Promise<Result<NodeResponses.SendDefundChannelTx, ServerNodeServiceError>> {
    return this.executeHttpRequest(`send-defund-channel-tx`, "post", params, NodeParams.SendDefundChannelTxSchema);
  }

  sendDisputeTransferTx(
    params: OptionalPublicIdentifier<NodeParams.SendDisputeTransferTx>,
  ): Promise<Result<NodeResponses.SendDisputeTransferTx, ServerNodeServiceError>> {
    return this.executeHttpRequest(`send-dispute-transfer-tx`, "post", params, NodeParams.SendDisputeTransferTxSchema);
  }

  sendDefundTransferTx(
    params: OptionalPublicIdentifier<NodeParams.SendDefundTransferTx>,
  ): Promise<Result<NodeResponses.SendDefundTransferTx, ServerNodeServiceError>> {
    return this.executeHttpRequest(`send-defund-transfer-tx`, "post", params, NodeParams.SendDefundTransferTxSchema);
  }

  async createNode(params: NodeParams.CreateNode): Promise<Result<NodeResponses.CreateNode, ServerNodeServiceError>> {
    const res = await this.executeHttpRequest<NodeResponses.CreateNode>(
      `node`,
      "post",
      params,
      NodeParams.CreateNodeSchema,
    );
    if (res.isError) {
      return res;
    }

    if (!this.evts) {
      return res;
    }

    // Register listener subscription
    const { publicIdentifier } = res.getValue();

    // Check if the events have been registered (i.e. this called
    // twice)
    if (this.ctxs[publicIdentifier]) {
      return res;
    }

    const urls = Object.fromEntries(
      Object.entries(this.evts).map(([event, config]) => {
        return [event, config.url ?? ""];
      }),
    );

    // Create an evt context for this public identifier only
    // (see not in `off`)
    this.ctxs[publicIdentifier] = Evt.newCtx();
    const subscriptionParams: NodeParams.RegisterListener = {
      events: urls,
      publicIdentifier,
    };
    // IFF the public identifier is undefined, it should be overridden by
    // the pubId defined in the parameters.
    const subscription = await this.executeHttpRequest(
      `event/subscribe`,
      "post",
      subscriptionParams,
      NodeParams.RegisterListenerSchema,
    );
    if (subscription.isError) {
      this.logger.error({ error: subscription.getError()!, publicIdentifier }, "Failed to create subscription");
      return Result.fail(subscription.getError()!);
    }
    this.logger.info({ urls, method: "createNode", publicIdentifier }, "Engine event subscription created");

    return res;
  }

  async getStateChannel(
    params: OptionalPublicIdentifier<NodeParams.GetChannelState>,
  ): Promise<Result<NodeResponses.GetChannelState, ServerNodeServiceError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/channels/${params.channelAddress}`,
      "get",
      params,
      NodeParams.GetChannelStateSchema,
    );
  }

  async getStateChannels(
    params: OptionalPublicIdentifier<NodeParams.GetChannelStates>,
  ): Promise<Result<NodeResponses.GetChannelStates, ServerNodeServiceError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/channels`,
      "get",
      params,
      NodeParams.GetChannelStatesSchema,
    );
  }

  async getTransfersByRoutingId(
    params: OptionalPublicIdentifier<NodeParams.GetTransferStatesByRoutingId>,
  ): Promise<Result<NodeResponses.GetTransferStatesByRoutingId, ServerNodeServiceError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/transfers/routing-id/${params.routingId}`,
      "get",
      params,
      NodeParams.GetTransferStatesByRoutingIdSchema,
    );
  }

  async getTransferByRoutingId(
    params: OptionalPublicIdentifier<NodeParams.GetTransferStateByRoutingId>,
  ): Promise<Result<NodeResponses.GetTransferStateByRoutingId, ServerNodeServiceError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/channels/${params.channelAddress}/transfers/routing-id/${
        params.routingId
      }`,
      "get",
      params,
      NodeParams.GetTransferStateByRoutingIdSchema,
    );
  }

  async getTransfer(
    params: OptionalPublicIdentifier<NodeParams.GetTransferState>,
  ): Promise<Result<NodeResponses.GetTransferState, ServerNodeServiceError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/transfers/${params.transferId}`,
      "get",
      params,
      NodeParams.GetTransferStateSchema,
    );
  }

  async getActiveTransfers(
    params: OptionalPublicIdentifier<NodeParams.GetActiveTransfersByChannelAddress>,
  ): Promise<Result<NodeResponses.GetActiveTransfersByChannelAddress, ServerNodeServiceError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/channels/${params.channelAddress}/active-transfers`,
      "get",
      params,
      NodeParams.GetActiveTransfersByChannelAddressSchema,
    );
  }

  async getStateChannelByParticipants(
    params: OptionalPublicIdentifier<NodeParams.GetChannelStateByParticipants>,
  ): Promise<Result<NodeResponses.GetChannelStateByParticipants, ServerNodeServiceError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/channels/counterparty/${params.counterparty}/chain-id/${
        params.chainId
      }`,
      "get",
      params,
      NodeParams.GetChannelStateByParticipantsSchema,
    );
  }

  getRegisteredTransfers(
    params: OptionalPublicIdentifier<NodeParams.GetRegisteredTransfers>,
  ): Promise<Result<NodeResponses.GetRegisteredTransfers, ServerNodeServiceError>> {
    return this.executeHttpRequest(
      `${params.publicIdentifier ?? this.publicIdentifier}/registered-transfers/chain-id/${params.chainId}`,
      "get",
      params,
      NodeParams.GetRegisteredTransfersSchema,
    );
  }

  restoreState(
    params: OptionalPublicIdentifier<NodeParams.RestoreState>,
  ): Promise<Result<NodeResponses.RestoreState, ServerNodeServiceError>> {
    return this.executeHttpRequest<NodeResponses.RestoreState>(
      `restore`,
      "post",
      params,
      NodeParams.RestoreStateSchema,
    );
  }

  async setup(
    params: OptionalPublicIdentifier<NodeParams.RequestSetup>,
  ): Promise<Result<NodeResponses.RequestSetup, ServerNodeServiceError>> {
    return this.executeHttpRequest<NodeResponses.RequestSetup>("setup", "post", params, NodeParams.RequestSetupSchema);
  }

  async internalSetup(
    params: OptionalPublicIdentifier<NodeParams.Setup>,
  ): Promise<Result<NodeResponses.Setup, ServerNodeServiceError>> {
    return this.executeHttpRequest<NodeResponses.Setup>("internal-setup", "post", params, NodeParams.SetupSchema);
  }

  async sendDepositTx(
    params: OptionalPublicIdentifier<NodeParams.SendDepositTx>,
  ): Promise<Result<NodeResponses.SendDepositTx, ServerNodeServiceError>> {
    return this.executeHttpRequest<NodeResponses.SendDepositTx>(
      "send-deposit-tx",
      "post",
      params,
      NodeParams.SendDepositTxSchema,
    );
  }

  async reconcileDeposit(
    params: OptionalPublicIdentifier<NodeParams.Deposit>,
  ): Promise<Result<NodeResponses.Deposit, ServerNodeServiceError>> {
    return this.executeHttpRequest<NodeResponses.Deposit>(
      "deposit",
      "post",
      {
        channelAddress: params.channelAddress,
        assetId: params.assetId,
        publicIdentifier: params.publicIdentifier,
      },
      NodeParams.DepositSchema,
    );
  }

  async requestCollateral(
    params: OptionalPublicIdentifier<NodeParams.RequestCollateral>,
  ): Promise<Result<NodeResponses.RequestCollateral, ServerNodeServiceError>> {
    return this.executeHttpRequest<NodeResponses.RequestCollateral>(
      "request-collateral",
      "post",
      params,
      NodeParams.RequestCollateralSchema,
    );
  }

  async conditionalTransfer(
    params: OptionalPublicIdentifier<NodeParams.ConditionalTransfer>,
  ): Promise<Result<NodeResponses.ConditionalTransfer, ServerNodeServiceError>> {
    return this.executeHttpRequest<NodeResponses.ConditionalTransfer>(
      `transfers/create`,
      "post",
      params,
      NodeParams.ConditionalTransferSchema,
    );
  }

  async resolveTransfer(
    params: OptionalPublicIdentifier<NodeParams.ResolveTransfer>,
  ): Promise<Result<NodeResponses.ResolveTransfer, ServerNodeServiceError>> {
    return this.executeHttpRequest<NodeResponses.ResolveTransfer>(
      `transfers/resolve`,
      "post",
      params,
      NodeParams.ResolveTransferSchema,
    );
  }

  async withdraw(
    params: OptionalPublicIdentifier<NodeParams.Withdraw>,
  ): Promise<Result<NodeResponses.Withdraw, ServerNodeServiceError>> {
    return this.executeHttpRequest<NodeResponses.Withdraw>(`withdraw`, "post", params, NodeParams.WithdrawSchema);
  }

  signUtilityMessage(
    params: OptionalPublicIdentifier<NodeParams.SignUtilityMessage>,
  ): Promise<Result<NodeResponses.SignUtilityMessage, ServerNodeServiceError>> {
    return this.executeHttpRequest<NodeResponses.SignUtilityMessage>(
      `sign-utility-message`,
      "post",
      params,
      NodeParams.SignUtilityMessageSchema,
    );
  }

  sendIsAliveMessage(
    params: OptionalPublicIdentifier<NodeParams.SendIsAlive>,
  ): Promise<Result<NodeResponses.SendIsAlive, ServerNodeServiceError>> {
    return this.executeHttpRequest<NodeResponses.SendIsAlive>(`is-alive`, "post", params, NodeParams.SendIsAliveSchema);
  }

  public once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter: (payload: EngineEventMap[T]) => boolean = () => true,
    publicIdentifier?: string,
  ): void {
    if (!this.evts || !this.evts[event]?.evt) {
      throw new ServerNodeServiceError(
        ServerNodeServiceError.reasons.NoEvts,
        publicIdentifier ?? this.publicIdentifier,
        "",
        { event, publicIdentifier },
      );
    }
    const pubId = publicIdentifier ?? this.publicIdentifier;
    if (!pubId) {
      throw new ServerNodeServiceError(ServerNodeServiceError.reasons.NoPublicIdentifier, "", "", {
        event,
        publicIdentifier,
      });
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
      throw new ServerNodeServiceError(
        ServerNodeServiceError.reasons.NoEvts,
        publicIdentifier ?? this.publicIdentifier,
        "",
        { event, publicIdentifier },
      );
    }
    const pubId = publicIdentifier ?? this.publicIdentifier;
    if (!pubId) {
      throw new ServerNodeServiceError(ServerNodeServiceError.reasons.NoPublicIdentifier, "", "", {
        event,
        publicIdentifier,
      });
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
      throw new ServerNodeServiceError(
        ServerNodeServiceError.reasons.NoEvts,
        publicIdentifier ?? this.publicIdentifier,
        "",
        { event, timeout, publicIdentifier },
      );
    }
    const pubId = publicIdentifier ?? this.publicIdentifier;
    if (!pubId) {
      throw new ServerNodeServiceError(ServerNodeServiceError.reasons.NoPublicIdentifier, "", "", {
        event,
        publicIdentifier,
      });
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
      throw new ServerNodeServiceError(
        ServerNodeServiceError.reasons.NoEvts,
        publicIdentifier ?? this.publicIdentifier,
        "",
        { event, publicIdentifier },
      );
    }
    if (!publicIdentifier && !this.publicIdentifier) {
      throw new ServerNodeServiceError(ServerNodeServiceError.reasons.NoPublicIdentifier, "", "", {
        event,
        publicIdentifier,
      });
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
  ): Promise<Result<U, ServerNodeServiceError>> {
    const url = `${this.serverNodeUrl}/${urlPath}`;
    // Validate parameters are in line with schema
    const validate = ajv.compile(paramSchema);
    // IFF the public identifier is undefined, it should be overridden by
    // the pubId defined in the parameters.
    const filled = { publicIdentifier: this.publicIdentifier, ...params };
    if (!validate(filled)) {
      return Result.fail(
        new ServerNodeServiceError(
          ServerNodeServiceError.reasons.InvalidParams,
          filled.publicIdentifer,
          urlPath,
          params,
          {
            paramsError: validate.errors?.map((err) => err.message).join(","),
          },
        ),
      );
    }

    // Attempt request
    try {
      const res = method === "get" ? await Axios.get(url) : await Axios.post(url, filled);
      return Result.ok(res.data);
    } catch (e) {
      const jsonErr = Object.keys(e).includes("toJSON") ? e.toJSON() : e;
      const msg = e.response?.data?.message ?? jsonErr.message ?? ServerNodeServiceError.reasons.InternalServerError;
      const toThrow = new ServerNodeServiceError(
        msg.includes("timed out") || msg.includes("timeout") ? ServerNodeServiceError.reasons.Timeout : msg,
        filled.publicIdentifier,
        urlPath,
        params,
        {
          ...(e.response?.data ?? { stack: jsonErr.stack ?? "" }),
        },
      );
      return Result.fail(toThrow);
    }
  }
}
