import {
  ChainProviders,
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  EngineEvent,
  EngineEventMap,
  EngineEvents,
  FullChannelState,
  FullTransferState,
  Result,
  ServerNodeParams,
  ServerNodeResponses,
  Values,
  VectorError,
} from "@connext/vector-types";
import Axios from "axios";
import { providers } from "ethers";
import { Evt } from "evt";
import { BaseLogger } from "pino";

export interface IServerNodeService {
  publicIdentifier: string;
  signerAddress: string;
  getStateChannelByParticipants(
    alice: string,
    bob: string,
    chainId: number,
  ): Promise<Result<FullChannelState | undefined, Error>>;
  getStateChannel(channelAddress: string): Promise<Result<FullChannelState | undefined, Error>>;
  getTransferByRoutingId(
    channelAddress: string,
    routingId: string,
  ): Promise<Result<FullTransferState | undefined, Error>>;
  getTransfersByRoutingId(routingId: string): Promise<Result<FullTransferState[], Error>>;
  setup(params: ServerNodeParams.Setup): Promise<Result<ServerNodeResponses.Setup, ServerNodeError>>;
  deposit(
    params: ServerNodeParams.SendDepositTx,
    chainId: number,
  ): Promise<Result<ServerNodeResponses.Deposit, ServerNodeError>>;
  conditionalTransfer(
    params: ServerNodeParams.ConditionalTransfer,
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, ServerNodeError>>;
  resolveTransfer(
    params: ServerNodeParams.ResolveTransfer,
  ): Promise<Result<ServerNodeResponses.ResolveTransfer, ServerNodeError>>;

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
    ProviderNotFound: "Provider not available for chain",
    Timeout: "Timeout",
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

  async getConfig(): Promise<Result<ServerNodeResponses.GetConfig, Error>> {
    try {
      const res = await Axios.get<ServerNodeResponses.GetConfig>(`${this.serverNodeUrl}/config`);
      return Result.ok(res.data);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getStateChannel(channelAddress: string): Promise<Result<FullChannelState | undefined, Error>> {
    try {
      const res = await Axios.get<ServerNodeResponses.GetChannelState>(
        `${this.serverNodeUrl}/channel/${channelAddress}`,
      );
      return Result.ok(res.data);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransfersByRoutingId(routingId: string): Promise<Result<FullTransferState[], Error>> {
    try {
      const res = await Axios.get<ServerNodeResponses.GetTransferStatesByRoutingId>(
        `${this.serverNodeUrl}/transfer/${routingId}`,
      );
      return Result.ok(res.data);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransferByRoutingId(
    channelAddress: string,
    routingId: string,
  ): Promise<Result<FullTransferState | undefined, Error>> {
    try {
      const res = await Axios.get<ServerNodeResponses.GetTransferStateByRoutingId>(
        `${this.serverNodeUrl}/channel/${channelAddress}/transfer/${routingId}`,
      );
      return Result.ok(res.data);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getStateChannelByParticipants(
    alice: string,
    bob: string,
    chainId: number,
  ): Promise<Result<FullChannelState | undefined, Error>> {
    try {
      const res = await Axios.get<ServerNodeResponses.GetChannelStateByParticipants>(
        `${this.serverNodeUrl}/channel/${alice}/${bob}/${chainId}`,
      );
      return Result.ok(res.data);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async setup(params: ServerNodeParams.Setup): Promise<Result<ServerNodeResponses.Setup, ServerNodeError>> {
    try {
      const res = await Axios.post<ServerNodeResponses.Setup>(`${this.serverNodeUrl}/setup`, {
        counterpartyIdentifier: params.counterpartyIdentifier,
        chainId: params.chainId,
        timeout: params.timeout,
      });
      return Result.ok(res.data);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async deposit(
    params: ServerNodeParams.SendDepositTx,
    chainId: number,
  ): Promise<Result<ServerNodeResponses.Deposit, ServerNodeError>> {
    try {
      const provider = this.assertProvider(chainId);
      const sendDepositTxRes = await Axios.post<ServerNodeResponses.SendDepositTx>(
        `${this.serverNodeUrl}/send-deposit-tx`,
        params,
      );
      this.logger.info({ txHash: sendDepositTxRes.data.txHash }, "Waiting for tx to be mined");
      await provider.waitForTransaction(sendDepositTxRes.data.txHash);
      this.logger.info({ txHash: sendDepositTxRes.data.txHash }, "Tx has been mined");
      const res = await Axios.post<ServerNodeResponses.Deposit>(`${this.serverNodeUrl}/deposit`, {
        channelAddress: params.channelAddress,
        assetId: params.assetId,
      });
      return Result.ok(res.data);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async conditionalTransfer(
    params: ServerNodeParams.ConditionalTransfer,
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, ServerNodeError>> {
    try {
      const res = await Axios.post<ServerNodeResponses.ConditionalTransfer>(
        `${this.serverNodeUrl}/linked-transfer/create`,
        params,
      );
      return Result.ok(res.data);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async resolveTransfer(
    params: ServerNodeParams.ResolveTransfer,
  ): Promise<Result<ServerNodeResponses.ResolveTransfer, ServerNodeError>> {
    try {
      const res = await Axios.post<ServerNodeResponses.ResolveTransfer>(
        `${this.serverNodeUrl}/linked-transfer/resolve`,
        params,
      );
      return Result.ok(res.data);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter: (payload: EngineEventMap[T]) => boolean = () => true,
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
}
