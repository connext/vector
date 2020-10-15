import {
  EngineEvent,
  EngineEventMap,
  INodeService,
  Result,
  ServerNodeParams,
  ServerNodeResponses,
  NodeError,
  Omit,
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
    if (index !== undefined || index !== null) {
      // Create the public identifier and signer address
      const node = await service.createNode({ index });
      if (node.isError) {
        console.log("***** error with config");
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
    params: Omit<ServerNodeParams.GetChannelState, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.GetChannelState, NodeError>> {
    return this.executeHttpRequest(
      `channel/${params.channelAddress}/${params.publicIdentifier ?? this.publicIdentifier}`,
      "get",
      params,
      ServerNodeParams.GetChannelStateSchema,
    );
  }

  async getStateChannels(
    params: Omit<ServerNodeParams.GetChannelStates, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.GetChannelStates, NodeError>> {
    return this.executeHttpRequest(`channel`, "get", params, ServerNodeParams.GetChannelStatesSchema);
  }

  async getTransfersByRoutingId(
    params: Omit<ServerNodeParams.GetTransferStatesByRoutingId, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.GetTransferStatesByRoutingId, NodeError>> {
    return this.executeHttpRequest(
      `transfer/${params.routingId}/${params.publicIdentifier ?? this.publicIdentifier}`,
      "get",
      params,
      ServerNodeParams.GetTransferStatesByRoutingIdSchema,
    );
  }

  async getTransferByRoutingId(
    params: Omit<ServerNodeParams.GetTransferStateByRoutingId, "publicIdentifier"> & { publicIdentifier?: string },
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
    params: Omit<ServerNodeParams.GetTransferState, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.GetTransferState, NodeError>> {
    return this.executeHttpRequest(
      `transfer/${params.transferId}/${params.publicIdentifier ?? this.publicIdentifier}`,
      "get",
      params,
      ServerNodeParams.GetTransferStateSchema,
    );
  }

  async getActiveTransfers(
    params: Omit<ServerNodeParams.GetActiveTransfersByChannelAddress, "publicIdentifier"> & {
      publicIdentifier?: string;
    },
  ): Promise<Result<ServerNodeResponses.GetActiveTransfersByChannelAddress, NodeError>> {
    return this.executeHttpRequest(
      `channel/${params.channelAddress}/active-transfer/${params.publicIdentifier ?? this.publicIdentifier}`,
      "get",
      params,
      ServerNodeParams.GetActiveTransfersByChannelAddressSchema,
    );
  }

  async getStateChannelByParticipants(
    params: Omit<ServerNodeParams.GetChannelStateByParticipants, "publicIdentifier"> & { publicIdentifier?: string },
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
    return this.executeHttpRequest<ServerNodeResponses.RequestSetup>(
      "request-setup",
      "post",
      params,
      ServerNodeParams.RequestSetupSchema,
    );
  }

  async setup(
    params: Omit<ServerNodeParams.Setup, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.Setup, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.Setup>("setup", "post", params, ServerNodeParams.SetupSchema);
  }

  async sendDepositTx(
    params: Omit<ServerNodeParams.SendDepositTx, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.SendDepositTx, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.SendDepositTx>(
      "send-deposit-tx",
      "post",
      { ...params, publicIdentifier: params.publicIdentifier },
      ServerNodeParams.SendDepositTxSchema,
    );
  }

  async reconcileDeposit(
    params: Omit<ServerNodeParams.Deposit, "publicIdentifier"> & { publicIdentifier?: string },
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
    params: Omit<ServerNodeParams.ConditionalTransfer, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.ConditionalTransfer>(
      `hashlock-transfer/create`,
      "post",
      { ...params, publicIdentifier: params.publicIdentifier },
      ServerNodeParams.ConditionalTransferSchema,
    );
  }

  async resolveTransfer(
    params: Omit<ServerNodeParams.ResolveTransfer, "publicIdentifier"> & { publicIdentifier?: string },
  ): Promise<Result<ServerNodeResponses.ResolveTransfer, NodeError>> {
    return this.executeHttpRequest<ServerNodeResponses.ResolveTransfer>(
      `hashlock-transfer/resolve`,
      "post",
      { ...params, publicIdentifier: params.publicIdentifier },
      ServerNodeParams.ResolveTransferSchema,
    );
  }

  async withdraw(
    params: Omit<ServerNodeParams.Withdraw, "publicIdentifier"> & { publicIdentifier?: string },
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
