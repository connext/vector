import {
  ChainProviders,
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  EngineEvent,
  EngineEventMap,
  EngineEvents,
  Result,
  ServerNodeParams,
  ServerNodeResponses,
  Values,
  VectorError,
} from "@connext/vector-types";
import Ajv from "ajv";
import Axios from "axios";
import { providers } from "ethers";
import { Evt } from "evt";
import { BaseLogger } from "pino";

const ajv = new Ajv();

export interface IServerNodeService {
  publicIdentifier: string;
  signerAddress: string;
  getStateChannelByParticipants(
    params: ServerNodeParams.GetChannelStateByParticipants,
  ): Promise<Result<ServerNodeResponses.GetChannelStateByParticipants, ServerNodeError>>;

  getStateChannel(
    params: ServerNodeParams.GetChannelState,
  ): Promise<Result<ServerNodeResponses.GetChannelState, ServerNodeError>>;

  getTransferByRoutingId(
    params: ServerNodeParams.GetTransferStateByRoutingId,
  ): Promise<Result<ServerNodeResponses.GetTransferStateByRoutingId, ServerNodeError>>;

  getTransfersByRoutingId(
    params: ServerNodeParams.GetTransferStatesByRoutingId,
  ): Promise<Result<ServerNodeResponses.GetTransferStatesByRoutingId, ServerNodeError>>;

  setup(params: ServerNodeParams.Setup): Promise<Result<ServerNodeResponses.Setup, ServerNodeError>>;

  deposit(params: ServerNodeParams.SendDepositTx): Promise<Result<ServerNodeResponses.Deposit, ServerNodeError>>;

  conditionalTransfer(
    params: ServerNodeParams.ConditionalTransfer,
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, ServerNodeError>>;

  resolveTransfer(
    params: ServerNodeParams.ResolveTransfer,
  ): Promise<Result<ServerNodeResponses.ResolveTransfer, ServerNodeError>>;

  withdraw(params: ServerNodeParams.Withdraw): Promise<Result<ServerNodeResponses.Withdraw, ServerNodeError>>;

  once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void>;

  on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void>;
}

export class ServerNodeError extends VectorError {
  readonly type = VectorError.errors.ServerNodeError;

  static readonly reasons = {
    InternalServerError: "Failed to send request",
    InvalidParams: "Request has invalid parameters",
    ProviderNotFound: "Provider not available for chain",
    Timeout: "Timeout",
    TransactionNotMined: "Failed to wait for transaction to be mined",
  } as const;

  constructor(
    public readonly message: Values<typeof ServerNodeError.reasons>,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    public readonly context?: any,
  ) {
    super(message, context);
  }
}

type EventEvts = {
  [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: Evt<ConditionalTransferCreatedPayload>;
  [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: Evt<ConditionalTransferResolvedPayload>;
};

export class RestServerNodeService implements IServerNodeService {
  public publicIdentifier = "";
  public signerAddress = "";
  public chainProviders: { [chainId: string]: providers.JsonRpcProvider } = {};

  private constructor(
    private readonly serverNodeUrl: string,
    private readonly callbackUrlBase: string,
    private readonly providerUrls: ChainProviders,
    private readonly evts: EventEvts,
    private readonly logger: BaseLogger,
  ) {
    Object.entries(providerUrls).forEach(([chainId, url]) => {
      this.chainProviders[chainId] = new providers.JsonRpcProvider(url);
    });
  }

  static async connect(
    serverNodeUrl: string,
    callbackUrlBase: string,
    providerUrls: ChainProviders,
    evts: EventEvts,
    logger: BaseLogger,
  ): Promise<RestServerNodeService> {
    const service = new RestServerNodeService(serverNodeUrl, callbackUrlBase, providerUrls, evts, logger);
    const configRes = await service.getConfig();
    if (configRes.isError) {
      throw configRes.getError();
    }

    service.publicIdentifier = configRes.getValue().publicIdentifier;
    service.signerAddress = configRes.getValue().signerAddress;
    return service;
  }

  private assertProvider(chainId: number): providers.JsonRpcProvider {
    if (!this.chainProviders[chainId]) {
      throw new ServerNodeError(ServerNodeError.reasons.ProviderNotFound, { chainId });
    }
    return this.chainProviders[chainId];
  }

  async getConfig(): Promise<Result<ServerNodeResponses.GetConfig, ServerNodeError>> {
    return this.executeHttpRequest("config", undefined, ServerNodeParams.GetConfigSchema);
  }

  async getStateChannel(
    params: ServerNodeParams.GetChannelState,
  ): Promise<Result<ServerNodeResponses.GetChannelState, ServerNodeError>> {
    return this.executeHttpRequest(`channel/${params.channelAddress}`, params, ServerNodeParams.GetChannelStateSchema);
  }

  async getTransfersByRoutingId(
    params: ServerNodeParams.GetTransferStatesByRoutingId,
  ): Promise<Result<ServerNodeResponses.GetTransferStatesByRoutingId, ServerNodeError>> {
    return this.executeHttpRequest(
      `transfer/${params.routingId}`,
      params,
      ServerNodeParams.GetTransferStateByRoutingIdSchema,
    );
  }

  async getTransferByRoutingId(
    params: ServerNodeParams.GetTransferStateByRoutingId,
  ): Promise<Result<ServerNodeResponses.GetTransferStateByRoutingId, ServerNodeError>> {
    return this.executeHttpRequest(
      `channel/${params.channelAddress}/transfer/${params.routingId}`,
      params,
      ServerNodeParams.GetTransferStateByRoutingIdSchema,
    );
  }

  async getStateChannelByParticipants(
    params: ServerNodeParams.GetChannelStateByParticipants,
  ): Promise<Result<ServerNodeResponses.GetChannelStateByParticipants, ServerNodeError>> {
    return this.executeHttpRequest(
      `channel/${params.alice}/${params.bob}/${params.chainId}`,
      params,
      ServerNodeParams.ConditionalTransferSchema,
    );
  }

  async setup(params: ServerNodeParams.Setup): Promise<Result<ServerNodeResponses.Setup, ServerNodeError>> {
    return this.executeHttpRequest(`setup`, params, ServerNodeParams.ConditionalTransferSchema);
  }

  async deposit(params: ServerNodeParams.SendDepositTx): Promise<Result<ServerNodeResponses.Deposit, ServerNodeError>> {
    let provider;
    try {
      provider = this.assertProvider(params.chainId);
    } catch (e) {
      return Result.fail(new ServerNodeError(ServerNodeError.reasons.ProviderNotFound));
    }

    const sendDepositTxRes = await this.executeHttpRequest(
      "send-deposit-tx",
      params,
      ServerNodeParams.SendDepositTxSchema,
    );

    if (sendDepositTxRes.isError) {
      return Result.fail(sendDepositTxRes.getError());
    }

    const { txHash } = sendDepositTxRes.getValue()!;

    try {
      this.logger.info({ txHash }, "Waiting for tx to be mined");
      const receipt = await provider.waitForTransaction(txHash);
      this.logger.info({ txHash: receipt.transactionHash }, "Tx has been mined");
    } catch (e) {
      return Result.fail(new ServerNodeError(ServerNodeError.reasons.TransactionNotMined, { txHash, params }));
    }
    return this.executeHttpRequest(
      "deposit",
      { channelAddress: params.channelAddress, assetId: params.assetId },
      ServerNodeParams.DepositSchema,
    );
  }

  async conditionalTransfer(
    params: ServerNodeParams.ConditionalTransfer,
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, ServerNodeError>> {
    return this.executeHttpRequest(`linked-transfer/create`, params, ServerNodeParams.ConditionalTransferSchema);
  }

  async resolveTransfer(
    params: ServerNodeParams.ResolveTransfer,
  ): Promise<Result<ServerNodeResponses.ResolveTransfer, ServerNodeError>> {
    return this.executeHttpRequest(`linked-transfer/resolve`, params, ServerNodeParams.ResolveTransferSchema);
  }

  async withdraw(params: ServerNodeParams.Withdraw): Promise<Result<ServerNodeResponses.Withdraw, ServerNodeError>> {
    return this.executeHttpRequest(`withdraw`, params, ServerNodeParams.WithdrawSchema);
  }

  async once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter: (payload: EngineEventMap[T]) => boolean = payload => true,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter: (payload: EngineEventMap[T]) => boolean = () => true,
  ): Promise<void> {
    let url: string | undefined;
    switch (event) {
      case EngineEvents.CONDITIONAL_TRANSFER_CREATED: {
        url = `${this.callbackUrlBase}/conditional-transfer-created`;
        this.evts[EngineEvents.CONDITIONAL_TRANSFER_CREATED].pipe(filter!).attach(callback);
        await Axios.post<ServerNodeResponses.ConditionalTransfer>(`${this.serverNodeUrl}/event/subscribe`, {
          [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: url,
        });
        break;
      }
      case EngineEvents.CONDITIONAL_TRANSFER_RESOLVED: {
        url = `${this.callbackUrlBase}/conditional-transfer-resolved`;
        this.evts[EngineEvents.CONDITIONAL_TRANSFER_RESOLVED].pipe(filter!).attach(callback);
        await Axios.post<ServerNodeResponses.ConditionalTransfer>(`${this.serverNodeUrl}/event/subscribe`, {
          [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: url,
        });
        this.logger.info(
          { eventName: EngineEvents.CONDITIONAL_TRANSFER_RESOLVED, url },
          "Engine event subscription created",
        );
        break;
      }
    }
    this.logger.info(
      { eventName: EngineEvents.CONDITIONAL_TRANSFER_CREATED, url },
      "Engine event subscription created",
    );
  }

  // Helper methods
  private async executeHttpRequest(
    urlPath: string,
    params: any,
    paramSchema: any,
  ): Promise<Result<any, ServerNodeError>> {
    // Validate parameters are in line with schema
    const validate = ajv.compile(paramSchema);
    if (!validate(params)) {
      return Result.fail(
        new ServerNodeError(ServerNodeError.reasons.InvalidParams, {
          errors: validate.errors?.map(err => err.message).join(","),
        }),
      );
    }

    // Attempt request
    const url = `${this.serverNodeUrl}/${urlPath}`;
    try {
      const res = await Axios.post<ServerNodeResponses.ResolveTransfer>(url, params);
      return Result.ok(res.data);
    } catch (e) {
      return Result.fail(
        new ServerNodeError(ServerNodeError.reasons.InternalServerError, { error: e.message, params, url }),
      );
    }
  }
}
