import { VectorChainService } from "@connext/vector-contracts";
import { VectorEngine } from "@connext/vector-engine";
import {
  ChainAddresses,
  ChainProviders,
  ChannelRpcMethods,
  CreateUpdateDetails,
  EngineEvent,
  EngineEventMap,
  EngineEvents,
  IChannelSigner,
  INodeService,
  IVectorEngine,
  NodeError,
  Result,
  ServerNodeParams,
  ServerNodeResponses,
} from "@connext/vector-types";
import {
  constructRpcRequest,
  getBearerTokenFunction,
  NatsMessagingService,
} from "@connext/vector-utils";
import Axios from "axios";
import { providers } from "ethers";
import { BaseLogger } from "pino";

import { BrowserStore } from "./services/store";
import { BrowserLockService } from "./services/lock";

export class BrowserNode implements INodeService {
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
    await messaging.connect();
    const store = new BrowserStore(log.child({ module: "BrowserStore" }));
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

  get publicIdentifier(): string {
    return this.engine.publicIdentifier;
  }

  get signerAddress(): string {
    return this.engine.signerAddress;
  }

  async getStateChannelByParticipants(
    params: ServerNodeParams.GetChannelStateByParticipants,
  ): Promise<Result<ServerNodeResponses.GetChannelStateByParticipants, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_getChannelStateByParticipants, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_getChannelStateByParticipants>(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getStateChannel(
    params: ServerNodeParams.GetChannelState,
  ): Promise<Result<ServerNodeResponses.GetChannelState, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_getChannelState, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_getChannelState>(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransferByRoutingId(
    params: ServerNodeParams.GetTransferStateByRoutingId,
  ): Promise<Result<ServerNodeResponses.GetTransferStateByRoutingId, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_getTransferStateByRoutingId, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_getTransferStateByRoutingId>(rpc);
      return Result.ok(res);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async getTransfersByRoutingId(
    params: ServerNodeParams.GetTransferStatesByRoutingId,
  ): Promise<Result<ServerNodeResponses.GetTransferStatesByRoutingId, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_getTransferStatesByRoutingId, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_getTransferStatesByRoutingId>(rpc);
      return Result.ok(res as ServerNodeResponses.GetTransferStatesByRoutingId);
    } catch (e) {
      return Result.fail(e);
    }
  }

  async requestSetup(
    params: ServerNodeParams.RequestSetup,
  ): Promise<Result<ServerNodeResponses.RequestSetup, NodeError>> {
    try {
      const setupPromise = this.engine.waitFor(
        EngineEvents.SETUP,
        10_000,
        data => data.bobIdentifier === this.engine.publicIdentifier && data.chainId === params.chainId,
      );
      await Axios.post(`${params.aliceUrl}/setup`, {
        chainId: params.chainId,
        counterpartyIdentifier: this.engine.publicIdentifier,
        timeout: params.timeout,
        meta: params.meta,
        publicIdentifier: params.aliceIdentifier,
      } as ServerNodeParams.Setup);
      const setup = await setupPromise;
      return Result.ok({ channelAddress: setup.channelAddress });
    } catch (e) {
      return Result.fail(e);
    }
  }

  // OK to leave unimplemented since browser node will never be Alice
  async setup(): Promise<Result<ServerNodeResponses.Setup, NodeError>> {
    throw new Error("Method not implemented");
  }

  // OK to leave unimplemented since all txes can be sent from outside the browser node
  async sendDepositTx(): Promise<Result<ServerNodeResponses.SendDepositTx, NodeError>> {
    throw new Error("Method not implemented.");
  }

  async reconcileDeposit(params: ServerNodeParams.Deposit): Promise<Result<ServerNodeResponses.Deposit, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_deposit, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_deposit>(rpc);
      return Result.ok({ channelAddress: res.channelAddress });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async conditionalTransfer(
    params: ServerNodeParams.ConditionalTransfer,
  ): Promise<Result<ServerNodeResponses.ConditionalTransfer, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_createTransfer, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_createTransfer>(rpc);
      return Result.ok({
        channelAddress: res.channelAddress,
        transferId: (res.latestUpdate.details as CreateUpdateDetails).transferId,
        routingId: (res.latestUpdate.details as CreateUpdateDetails).meta?.routingId,
      });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async resolveTransfer(
    params: ServerNodeParams.ResolveTransfer,
  ): Promise<Result<ServerNodeResponses.ResolveTransfer, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_resolveTransfer, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_resolveTransfer>(rpc);
      return Result.ok({
        channelAddress: res.channelAddress,
        transferId: (res.latestUpdate.details as CreateUpdateDetails).transferId,
        routingId: (res.latestUpdate.details as CreateUpdateDetails).meta?.routingId,
      });
    } catch (e) {
      return Result.fail(e);
    }
  }

  async withdraw(params: ServerNodeParams.Withdraw): Promise<Result<ServerNodeResponses.Withdraw, NodeError>> {
    const rpc = constructRpcRequest(ChannelRpcMethods.chan_withdraw, params);
    try {
      const res = await this.engine.request<typeof ChannelRpcMethods.chan_withdraw>(rpc);
      return Result.ok({
        channelAddress: res.channel.channelAddress,
        transferId: (res.channel.latestUpdate.details as CreateUpdateDetails).transferId,
        transactionHash: res.transactionHash,
      });
    } catch (e) {
      return Result.fail(e);
    }
  }

  waitFor<T extends EngineEvent>(
    event: T,
    timeout: number,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<EngineEventMap[T] | undefined> {
    return this.engine.waitFor(event, timeout, filter);
  }

  async once<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void> {
    return this.engine.once(event, callback, filter);
  }

  async on<T extends EngineEvent>(
    event: T,
    callback: (payload: EngineEventMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventMap[T]) => boolean,
  ): Promise<void> {
    return this.engine.on(event, callback, filter);
  }

  async off<T extends EngineEvent>(event: T): Promise<void> {
    return this.engine.off(event);
  }
}
