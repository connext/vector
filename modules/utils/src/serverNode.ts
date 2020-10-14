import {
  EngineEvent,
  EngineEventMap,
  INodeService,
  Result,
  ServerNodeParams,
  ServerNodeResponses,
  NodeError,
} from "@connext/vector-types";
import Ajv from "ajv";
import Axios from "axios";
import { Evt } from "evt";
import { BaseLogger } from "pino";

const ajv = new Ajv();

export type EventCallbackConfig = {
  [event in keyof EngineEventMap]: {
    evt?: Evt<EngineEventMap[event]>;
    url?: string;
  };
};

export class RestServerNodeService implements INodeService {
  private publicIdentifier: string | undefined = undefined;

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
    if (evts) {
      const urls = Object.fromEntries(
        Object.entries(evts).map(([event, config]) => {
          return [event, config.url];
        }),
      );
      try {
        await Axios.post<ServerNodeResponses.ConditionalTransfer>(`${serverNodeUrl}/event/subscribe`, urls);
        logger.info({ urls, method: "connect" }, "Engine event subscription created");
      } catch (e) {
        logger.error({ error: e.response?.data, urls, method: "connect" }, "Error creating subscription");
      }
    }

    // If an index is provided, the service will only host a single channel
    // and the publicIdentifier will be automatically included in parameters
    if (index) {
      // Create the public identifier and signer address
      const node = await service.createNode({ index });
      if (node.isError) {
        logger.error({ error: node.getError()!.message, method: "connect" }, "Failed to create node");
        return service;
      }
      const { publicIdentifier } = node.getValue();
      service.publicIdentifier = publicIdentifier;
    }

    return service;
  }

  async getConfig(): Promise<Result<ServerNodeResponses.GetConfig, NodeError>> {
    return this.executeHttpRequest("config", "get", {}, ServerNodeParams.GetConfigSchema);
  }

  async createNode(params: ServerNodeParams.CreateNode): Promise<Result<ServerNodeResponses.CreateNode, NodeError>> {
    return this.executeHttpRequest(`node`, "post", params, ServerNodeParams.CreateNodeSchema);
  }

  async getStateChannel(
    params: ServerNodeParams.GetChannelState,
  ): Promise<Result<ServerNodeResponses.GetChannelState, NodeError>> {
    return this.executeHttpRequest(
      `channel/${params.channelAddress}/${params.publicIdentifier ?? this.publicIdentifier}`,
      "get",
      params,
      ServerNodeParams.GetChannelStateSchema,
    );
  }

  async getStateChannels(
    params: ServerNodeParams.GetChannelStates,
  ): Promise<Result<ServerNodeResponses.GetChannelStates, NodeError>> {
    return this.executeHttpRequest(`channel`, "get", params, ServerNodeParams.GetChannelStatesSchema);
  }

  async getTransfersByRoutingId(
    params: ServerNodeParams.GetTransferStatesByRoutingId,
  ): Promise<Result<ServerNodeResponses.GetTransferStatesByRoutingId, NodeError>> {
    return this.executeHttpRequest(
      `transfer/${params.routingId}/${params.publicIdentifier ?? this.publicIdentifier}`,
      "get",
      params,
      ServerNodeParams.GetTransferStatesByRoutingIdSchema,
    );
  }

  async getTransferByRoutingId(
    params: ServerNodeParams.GetTransferStateByRoutingId,
  ): Promise<Result<ServerNodeResponses.GetTransferStateByRoutingId, NodeError>> {
    return this.executeHttpRequest(
      `channel/${params.channelAddress}/transfer/${params.routingId}/${params.publicIdentifier ??
        this.publicIdentifier}`,
      "get",
      params,
      ServerNodeParams.GetTransferStateByRoutingIdSchema,
    );
  }

  async getTransfer(
    params: ServerNodeParams.GetTransferState,
  ): Promise<Result<ServerNodeResponses.GetTransferState, NodeError>> {
    return this.executeHttpRequest(
      `transfer/${params.transferId}/${params.publicIdentifier ?? this.publicIdentifier}`,
      "get",
      params,
      ServerNodeParams.GetTransferStateSchema,
    );
  }

  async getActiveTransfers(
    params: ServerNodeParams.GetActiveTransfersByChannelAddress,
  ): Promise<Result<ServerNodeResponses.GetActiveTransfersByChannelAddress, NodeError>> {
    return this.executeHttpRequest(
      `channel/${params.channelAddress}/active-transfer/${params.publicIdentifier ?? this.publicIdentifier}`,
      "get",
      params,
      ServerNodeParams.GetActiveTransfersByChannelAddressSchema,
    );
  }

  async getStateChannelByParticipants(
    params: ServerNodeParams.GetChannelStateByParticipants,
  ): Promise<Result<ServerNodeResponses.GetChannelStateByParticipants, NodeError>> {
    return this.executeHttpRequest(
      `channel/${params.alice}/${params.bob}/${params.chainId}/${params.publicIdentifier ?? this.publicIdentifier}`,
      "get",
      params,
      ServerNodeParams.GetChannelStateByParticipantsSchema,
    );
  }

  async requestSetup(
    params: ServerNodeParams.RequestSetup,
  ): Promise<Result<ServerNodeResponses.RequestSetup, NodeError>> {
    return this.executeHttpRequest<ServerNodeParams.RequestSetup, ServerNodeResponses.RequestSetup>(
      "request-setup",
      "post",
      params,
      ServerNodeParams.RequestSetupSchema,
    );
  }

  async setup(params: ServerNodeParams.Setup): Promise<Result<ServerNodeResponses.Setup, NodeError>> {
    return this.executeHttpRequest<ServerNodeParams.Setup, ServerNodeResponses.Setup>(
      "setup",
      "post",
      params,
      ServerNodeParams.SetupSchema,
    );
  }

  async sendDepositTx(
    params: ServerNodeParams.SendDepositTx,
  ): Promise<Result<ServerNodeResponses.SendDepositTx, NodeError>> {
    return this.executeHttpRequest<ServerNodeParams.SendDepositTx, ServerNodeResponses.SendDepositTx>(
      "send-deposit-tx",
      "post",
      { ...params, publicIdentifier: params.publicIdentifier },
      ServerNodeParams.SendDepositTxSchema,
    );
  }

  async reconcileDeposit(params: ServerNodeParams.Deposit): Promise<Result<ServerNodeResponses.Deposit, NodeError>> {
    return this.executeHttpRequest<ServerNodeParams.Deposit, ServerNodeResponses.Deposit>(
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

  async conditionalTransfer(
    params: ServerNodeParams.ConditionalTransfer,
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, NodeError>> {
    return this.executeHttpRequest<ServerNodeParams.ConditionalTransfer, ServerNodeResponses.ConditionalTransfer>(
      `hashlock-transfer/create`,
      "post",
      { ...params, publicIdentifier: params.publicIdentifier },
      ServerNodeParams.ConditionalTransferSchema,
    );
  }

  async resolveTransfer(
    params: ServerNodeParams.ResolveTransfer,
  ): Promise<Result<ServerNodeResponses.ResolveTransfer, NodeError>> {
    return this.executeHttpRequest<ServerNodeParams.ResolveTransfer, ServerNodeResponses.ResolveTransfer>(
      `hashlock-transfer/resolve`,
      "post",
      { ...params, publicIdentifier: params.publicIdentifier },
      ServerNodeParams.ResolveTransferSchema,
    );
  }

  async withdraw(params: ServerNodeParams.Withdraw): Promise<Result<ServerNodeResponses.Withdraw, NodeError>> {
    return this.executeHttpRequest<ServerNodeParams.Withdraw, ServerNodeResponses.Withdraw>(
      `withdraw`,
      "post",
      { ...params, publicIdentifier: params.publicIdentifier },
      ServerNodeParams.WithdrawSchema,
    );
  }

  async once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter: (payload: EngineEventMap[T]) => boolean = () => true,
  ): Promise<void> {
    if (!this.evts || !this.evts[event]?.evt) {
      this.logger.warn({ event, method: "once" }, "No evts provided for event, subscriptions will not work");
      return;
    }
    this.evts[event].evt.pipe(filter!).attachOnce(callback);
  }

  async on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter: (payload: EngineEventMap[T]) => boolean = () => true,
  ): Promise<void> {
    if (!this.evts || !this.evts[event]?.evt) {
      this.logger.warn({ event, method: "on" }, "No evts provided for event, subscriptions will not work");
      return;
    }
    this.evts[event].evt.pipe(filter!).attach(callback);
  }

  public waitFor<T extends EngineEvent>(
    event: T,
    timeout: number,
    filter: (payload: EngineEventMap[T]) => boolean = () => true,
  ): Promise<EngineEventMap[T] | undefined> {
    if (!this.evts || !this.evts[event]?.evt) {
      this.logger.warn({ event, method: "waitFor" }, "No evts provided for event, subscriptions will not work");
      return undefined;
    }
    return this.evts[event].evt.pipe(filter).waitFor(timeout) as Promise<EngineEventMap[T]>;
  }

  async off<T extends EngineEvent>(event: T): Promise<void> {
    this.evts[event].evt.detach();
  }

  // Helper methods
  private async executeHttpRequest<T, U>(
    urlPath: string,
    method: "get" | "post",
    params: T,
    paramSchema: any,
  ): Promise<Result<U, NodeError>> {
    const url = `${this.serverNodeUrl}/${urlPath}`;
    // Validate parameters are in line with schema
    const validate = ajv.compile(paramSchema);
    // IFF the public identifier is undefined, it should be overridden by
    // the pubId defined in the parameters.
    if (!validate({ publicIdentifier: this.publicIdentifier, ...params })) {
      return Result.fail(
        new NodeError(NodeError.reasons.InvalidParams, {
          errors: validate.errors?.map(err => err.message).join(","),
        }),
      );
    }

    // Attempt request
    try {
      const res = method === "get" ? await Axios.get(url) : await Axios.post(url, params);
      return Result.ok(res.data);
    } catch (e) {
      return Result.fail(new NodeError(NodeError.reasons.InternalServerError, { error: e.message, params, url }));
    }
  }
}
