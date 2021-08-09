import { FilterByBlockHash, BlockWithTransactions, TransactionRequest } from "@ethersproject/abstract-provider";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import {
  JsonRpcProvider,
  FallbackProvider,
  Block,
  BlockTag,
  EventType,
  Filter,
  Listener,
  Log,
  Network,
  Provider,
  Resolver,
  TransactionReceipt,
  TransactionResponse,
} from "@ethersproject/providers";
import { Deferrable } from "@ethersproject/properties";

export type ChainRpcProviders = {
  [chainId: number]: string[]
};

export type HydratedProviders = {
  [chainId: number]: ChainRpcProvider;
};

/* Represents an aggregate of providers for a particular chain. Leverages functionality from
*  @ethersproject/providers/FallbackProvider in order to fallback to other providers in the
*  event of failed requests.
*/
export class ChainRpcProvider implements Provider {
  readonly chainId: number;
  readonly providerUrls: string[];
  readonly _provider: JsonRpcProvider | FallbackProvider;

  RPC_TIMEOUT: number = 10_000;
  _isProvider: boolean = true;
  _networkPromise: Promise<Network>;
  _network: Network;
  anyNetwork: boolean = false;

  constructor(chainId: number, providers: string[] | JsonRpcProvider[], stallTimeout?: number) {
    // We'll collect all the provider URLs as we hydrate each provider.
    var providerUrls: string[] = [];
    var provider: JsonRpcProvider | FallbackProvider;
    if (providers.length > 1) {
      provider = new FallbackProvider(
        // Map the provider URLs into JsonRpcProviders 
        providers.map((provider: string | JsonRpcProvider, priority: number) => {
          const hydratedProvider = (typeof(provider) === "string") ? new JsonRpcProvider(provider, chainId) : provider;
          providerUrls.push(hydratedProvider.connection.url);
          return {
            provider: hydratedProvider,
            priority: priority,
            // Timeout before also triggering the next provider; this does not stop
            // this provider and if its result comes back before a quorum is reached
            // it will be incorporated into the vote
            // - lower values will cause more network traffic but may result in a
            //   faster retult.
            // TODO: Should we have our own default timeout defined, as well as a config option for this?
            // Default timeout is written as either 2sec or .75sec (in @ethers-project/fallback-provider.ts):
            // config.stallTimeout = isCommunityResource(configOrProvider) ? 2000: 750;
            stallTimeout,
            weight: 1
          }
        }),
        // Quorum stays at 1, since we only ever want to send reqs to 1 node at a time.
        1
      );
    } else if (providers.length === 1) {
      const singleProvider = providers[0];
      provider = (typeof(singleProvider) === "string") ? new JsonRpcProvider(singleProvider, chainId) : singleProvider;
    } else {
      throw new Error("At least one provider must be defined.")
    }

    this._networkPromise = provider.getNetwork();
    this._network = provider.network;

    this._provider = provider;
    this.chainId = chainId;
    this.providerUrls = providerUrls;
  }

  send(method: string, params: any[]): Promise<any> {
    if (this._provider instanceof JsonRpcProvider) {
      return (this._provider as JsonRpcProvider).send(method, params);
    } else {
      const providers = (this._provider as FallbackProvider).providerConfigs.map(p => p.provider as JsonRpcProvider);
      var errors: Error[] = [];
      return Promise.race<any>(
        providers.map(provider => {
          return new Promise(async (resolve, reject) => {
            try {
              const result = await provider.send(method, params);
              resolve(result);
            } catch (e) {
              errors.push(e);
              // If this was the last request, and we've gotten all errors, let's reject.
              if (errors.length === providers.length) {
                reject(errors);
              }
            }
          });
        })
        .concat(
          // Ten second timeout to reject with errors.
          new Promise((_, reject) => {
            setTimeout(() => reject(errors), this.RPC_TIMEOUT)
          })
        )
      );
    }
  }

  async call(transaction: Deferrable<TransactionRequest>, blockTag?: BlockTag | Promise<BlockTag>): Promise<string> {
    return this._provider.call(transaction, blockTag);
  }

  async estimateGas(transaction: Deferrable<TransactionRequest>): Promise<BigNumber> {
    return this._provider.estimateGas(transaction);
  }

  poll(): Promise<void> {
    return this._provider.poll();
  }

  resetEventsBlock(blockNumber: number): void {
    return this._provider.resetEventsBlock(blockNumber);
  }
  
  detectNetwork(): Promise<Network> {
    return this._provider.detectNetwork();
  }

  getNetwork(): Promise<Network> {
    return this._provider.getNetwork();
  }

  waitForTransaction(transactionHash: string, confirmations?: number, timeout?: number): Promise<TransactionReceipt> {
    return this._provider.waitForTransaction(transactionHash, confirmations, timeout);
  }

  getBlockNumber(): Promise<number> {
    return this._provider.getBlockNumber();
  }

  getGasPrice(): Promise<BigNumber> {
    return this._provider.getGasPrice();
  }

  getBalance(addressOrName: string | Promise<string>, blockTag?: BlockTag | Promise<BlockTag>): Promise<BigNumber> {
    return this._provider.getBalance(addressOrName, blockTag);
  }

  getTransactionCount(addressOrName: string | Promise<string>, blockTag?: BlockTag | Promise<BlockTag>): Promise<number> {
    return this._provider.getTransactionCount(addressOrName, blockTag);
  }

  getCode(addressOrName: string | Promise<string>, blockTag?: BlockTag | Promise<BlockTag>): Promise<string> {
    return this._provider.getCode(addressOrName, blockTag);
  }

  getStorageAt(addressOrName: string | Promise<string>, position: BigNumberish | Promise<BigNumberish>, blockTag?: BlockTag | Promise<BlockTag>): Promise<string> {
    return this._provider.getStorageAt(addressOrName, position);
  }

  sendTransaction(signedTransaction: string | Promise<string>): Promise<TransactionResponse> {
    return this._provider.sendTransaction(signedTransaction);
  }

  getBlock(blockHashOrBlockTag: BlockTag | Promise<BlockTag>): Promise<Block> {
    return this._provider.getBlock(blockHashOrBlockTag);
  }

  getBlockWithTransactions(blockHashOrBlockTag: BlockTag | Promise<BlockTag>): Promise<BlockWithTransactions> {
    return this._provider.getBlockWithTransactions(blockHashOrBlockTag);
  }

  getTransaction(transactionHash: string | Promise<string>): Promise<TransactionResponse> {
    return this._provider.getTransaction(transactionHash);
  }

  getTransactionReceipt(transactionHash: string | Promise<string>): Promise<TransactionReceipt> {
    return this._provider.getTransactionReceipt(transactionHash);
  }

  getLogs(filter: Filter | FilterByBlockHash | Promise<Filter | FilterByBlockHash>): Promise<Log[]> {
    return this._provider.getLogs(filter);
  }

  getEtherPrice(): Promise<number> {
    return this._provider.getEtherPrice();
  }

  getResolver(name: string): Promise<Resolver> {
    return this._provider.getResolver(name);
  }

  resolveName(name: string | Promise<string>): Promise<string> {
    return this._provider.resolveName(name);
  }

  lookupAddress(address: string | Promise<string>): Promise<string> {
    return this._provider.lookupAddress(address);
  }

  perform(method: string, params: any): Promise<any> {
    return this._provider.perform(method, params);
  }

  on(eventName: EventType, listener: Listener): this {
    this._provider.on(eventName, listener);
    return this;
  }

  off(eventName: EventType, listener?: Listener): this {
    this._provider.off(eventName, listener);
    return this;
  }

  once(eventName: EventType, listener: Listener): this {
    this._provider.once(eventName, listener);
    return this;
  }

  emit(eventName: EventType, ...args: any[]): boolean {
    return this._provider.emit(eventName, ...args);
  }

  listenerCount(eventName?: EventType): number {
    return this._provider.listenerCount(eventName);
  }

  listeners(eventName?: EventType): Listener[] {
    return this._provider.listeners(eventName);
  }

  removeAllListeners(eventName?: EventType): this {
    this._provider.removeAllListeners(eventName);
    return this;
  }

  addListener(eventName: EventType, listener: Listener): Provider {
    return this._provider.addListener(eventName, listener);
  }

  removeListener(eventName: EventType, listener: Listener): Provider {
    return this._provider.removeListener(eventName, listener);
  }

}