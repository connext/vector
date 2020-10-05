import {
  IServerNodeService,
  ServerNodeError,
  NatsMessagingService,
  getBearerTokenFunction,
} from "@connext/vector-utils";
import {
  ServerNodeParams,
  ServerNodeResponses,
  EngineEvent,
  EngineEventMap,
  Result,
  IChannelSigner,
  IVectorEngine,
  ChainProviders,
  ChainAddresses,
} from "@connext/vector-types";
import { VectorEngine } from "@connext/vector-engine";
import { BaseLogger } from "pino";
import { VectorChainService } from "@connext/vector-contracts";
import { providers } from "ethers";

import { BrowserStore } from "./services/store";
import { BrowserLockService } from "./services/lock";

// TODO: rename IServerNodeService to INodeService
export class BrowserNode implements IServerNodeService {
  publicIdentifier = "";
  signerAddress = "";

  private constructor(private readonly engine: IVectorEngine) {}

  static async connect(
    messagingUrl: string,
    log: BaseLogger,
    signer: IChannelSigner,
    authUrl: string,
    chainProviders: ChainProviders,
    chainAddresses: ChainAddresses,
  ): Promise<BrowserNode> {
    const chainJsonProviders = Object.fromEntries(
      Object.entries(chainProviders).map(([chainId, url]) => {
        return [chainId, new providers.JsonRpcProvider(url)];
      }),
    );
    const messaging = new NatsMessagingService({ messagingUrl }, log, getBearerTokenFunction(signer, authUrl));
    const store = new BrowserStore();
    const lock = new BrowserLockService();
    const chainService = new VectorChainService(store, chainJsonProviders, signer, log);
    const engine = await VectorEngine.connect(
      messaging,
      lock,
      store,
      signer,
      chainService,
      chainProviders,
      chainAddresses,
      log.child({ module: "VectorEngine" }),
    );
    const node = new BrowserNode(engine);
    return node;
  }

  async getStateChannelByParticipants(
    params: ServerNodeParams.GetChannelStateByParticipants,
  ): Promise<Result<ServerNodeResponses.GetChannelStateByParticipants, ServerNodeError>> {
    throw new Error("Method not implemented");
  }

  async getStateChannel(
    params: ServerNodeParams.GetChannelState,
  ): Promise<Result<ServerNodeResponses.GetChannelState, ServerNodeError>> {
    throw new Error("Method not implemented");
  }

  async getTransferByRoutingId(
    params: ServerNodeParams.GetTransferStateByRoutingId,
  ): Promise<Result<ServerNodeResponses.GetTransferStateByRoutingId, ServerNodeError>> {
    throw new Error("Method not implemented");
  }

  async getTransfersByRoutingId(
    params: ServerNodeParams.GetTransferStatesByRoutingId,
  ): Promise<Result<ServerNodeResponses.GetTransferStatesByRoutingId, ServerNodeError>> {
    throw new Error("Method not implemented");
  }

  async setup(params: ServerNodeParams.Setup): Promise<Result<ServerNodeResponses.Setup, ServerNodeError>> {
    throw new Error("Method not implemented");
  }

  async deposit(params: ServerNodeParams.SendDepositTx): Promise<Result<ServerNodeResponses.Deposit, ServerNodeError>> {
    throw new Error("Method not implemented");
  }

  async conditionalTransfer(
    params: ServerNodeParams.ConditionalTransfer,
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, ServerNodeError>> {
    throw new Error("Method not implemented");
  }

  async resolveTransfer(
    params: ServerNodeParams.ResolveTransfer,
  ): Promise<Result<ServerNodeResponses.ResolveTransfer, ServerNodeError>> {
    throw new Error("Method not implemented");
  }

  async withdraw(params: ServerNodeParams.Withdraw): Promise<Result<ServerNodeResponses.Withdraw, ServerNodeError>> {
    throw new Error("Method not implemented");
  }

  async once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void> {
    throw new Error("Method not implemented");
  }

  async on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void> {
    throw new Error("Method not implemented");
  }

  async off<T extends EngineEvent>(event: T): Promise<void> {
    throw new Error("Method not implemented");
  }
}
