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
    // If an index is provided, the service will only host a single engine
    // and the publicIdentifier will be automatically included in parameters
    if (index !== undefined || index !== null) {
      // Create the public identifier and signer address
      const node = await service.createNode({ index });
      if (node.isError) {
        logger.error({ error: node.getError()!.message, method: "connect" }, "Failed to create node");
        throw node.getError();
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
          return [event, config.url];
        }),
      );
      try {
        await Axios.post<ServerNodeResponses.ConditionalTransfer>(
          `${this.serverNodeUrl}/${res.getValue().publicIdentifier}/event/subscribe`,
          urls,
        );
        this.logger.info({ urls, method: "connect" }, "Engine event subscription created");
      } catch (e) {
        this.logger.error({ error: e.response?.data, urls, method: "connect" }, "Error creating subscription");
      }
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
      `${params.publicIdentifier ?? this.publicIdentifier}/channels/${params.channelAddress}/transfer/routing-id/${
        params.routingId
      }/`,
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
    params: ServerNodeParams.RequestSetup,
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
      { ...params, publicIdentifier: params.publicIdentifier },
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

  async conditionalTransfer(
    params: OptionalPublicIdentifier<ServerNodeParams.ConditionalTransfer>,
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.ConditionalTransfer>(
      `hashlock-transfer/create`,
      "post",
      { ...params, publicIdentifier: params.publicIdentifier },
      ServerNodeParams.ConditionalTransferSchema,
    );
  }

  async resolveTransfer(
    params: OptionalPublicIdentifier<ServerNodeParams.ResolveTransfer>,
  ): Promise<Result<ServerNodeResponses.ResolveTransfer, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.ResolveTransfer>(
      `hashlock-transfer/resolve`,
      "post",
      { ...params, publicIdentifier: params.publicIdentifier },
      ServerNodeParams.ResolveTransferSchema,
    );
  }

  async withdraw(
    params: OptionalPublicIdentifier<ServerNodeParams.Withdraw>,
  ): Promise<Result<ServerNodeResponses.Withdraw, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.Withdraw>(
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
    publicIdentifier?: string,
  ): Promise<void> {
    if (!this.evts || !this.evts[event]?.evt) {
      this.logger.warn({ event, method: "once" }, "No evts provided for event, subscriptions will not work");
      return;
    }
    this.evts[event].evt
      .pipe((data: EngineEventMap[T]) => {
        const filtered = filter(data);
        return filtered && (data.aliceIdentifier === publicIdentifier || data.bobIdentifier === publicIdentifier);
      })
      .attachOnce(callback);
  }

  async on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter: (payload: EngineEventMap[T]) => boolean = () => true,
    publicIdentifier?: string,
  ): Promise<void> {
    if (!this.evts || !this.evts[event]?.evt) {
      this.logger.warn({ event, method: "on" }, "No evts provided for event, subscriptions will not work");
      return;
    }
    this.evts[event].evt
      .pipe((data: EngineEventMap[T]) => {
        const filtered = filter(data);
        return filtered && (data.aliceIdentifier === publicIdentifier || data.bobIdentifier === publicIdentifier);
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
      this.logger.warn({ event, method: "waitFor" }, "No evts provided for event, subscriptions will not work");
      return undefined;
    }
    return this.evts[event].evt
      .pipe((data: EngineEventMap[T]) => {
        const filtered = filter(data);
        return filtered && (data.aliceIdentifier === publicIdentifier || data.bobIdentifier === publicIdentifier);
      })
      .waitFor(timeout) as Promise<EngineEventMap[T]>;
  }

  async off<T extends EngineEvent>(event: T, publicIdentifier?: string): Promise<void> {
    this.evts[event].evt.detach();
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
      const jsonErr = Object.keys(e).includes("toJSON") ? e.toJSON() : e;
      return Result.fail(
        new NodeError(jsonErr.message ?? NodeError.reasons.InternalServerError, { stack: jsonErr.stack, params, url }),
      );
    }
  }
}
