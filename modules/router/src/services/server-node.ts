import {
  ChainProviders,
  EngineEvent,
  EngineEventMap,
  EngineEvents,
  FullChannelState,
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
  deposit(
    params: ServerNodeParams.SendDepositTx,
    chainId: number,
  ): Promise<Result<ServerNodeResponses.Deposit, ServerNodeError>>;
  conditionalTransfer(
    params: ServerNodeParams.ConditionalTransfer,
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, ServerNodeError>>;

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

export class RestServerNodeService implements IServerNodeService {
  public publicIdentifier = "";
  public signerAddress = "";
  public chainProviders: { [chainId: string]: providers.JsonRpcProvider } = {};

  private constructor(
    private readonly serverNodeUrl: string,
    private readonly providerUrls: ChainProviders,
    private readonly conditionalTransferEvt: Evt<any>,
    private readonly logger: BaseLogger,
  ) {
    Object.entries(providerUrls).forEach(([chainId, url]) => {
      this.chainProviders[chainId] = new providers.JsonRpcProvider(url);
    });
  }

  static async connect(
    serverNodeUrl: string,
    providerUrls: ChainProviders,
    conditionalTransferEvt: Evt<any>,
    logger: BaseLogger,
  ): Promise<RestServerNodeService> {
    const service = new RestServerNodeService(serverNodeUrl, providerUrls, conditionalTransferEvt, logger);
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
      console.log("sendDepositTxRes.data.txHash: ", sendDepositTxRes.data.txHash);
      await provider.waitForTransaction(sendDepositTxRes.data.txHash);

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

  async once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void> {
    switch (event) {
      case EngineEvents.CONDITIONAL_TRANFER_CREATED: {
        this.conditionalTransferEvt.pipe(filter!).attach(callback);
        const res = await Axios.post<ServerNodeResponses.ConditionalTransfer>(`${this.serverNodeUrl}/event/subscribe`, {
          events: [EngineEvents.CONDITIONAL_TRANFER_CREATED],
          urls: ["http://router:8008/conditional-transfer-created"],
        });
        console.log("res: ", res);
      }
    }
  }
}
