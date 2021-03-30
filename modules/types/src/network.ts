import { FilterByBlockHash, BlockWithTransactions, TransactionRequest } from "@ethersproject/abstract-provider";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { JsonRpcProvider, FallbackProvider, BaseProvider, Block, BlockTag, EventType, Filter, Formatter, Listener, Log, Network, Provider, Resolver, TransactionReceipt, TransactionResponse } from "@ethersproject/providers";
import { Event } from "@ethersproject/providers/lib/base-provider";
import { Transaction } from "@ethersproject/transactions";
import { Deferrable } from "@ethersproject/properties";

export type ChainProviders = {
  [chainId: number]: string[]
};

export type HydratedProviders = {
  [chainId: number]: ChainProvider;
};

/* Represents an aggregate of providers for a particular chain. Leverages functionality from
*  @ethersproject/providers/FallbackProvider in order to fallback to other providers in the
*  event of failed requests.
*/
export class ChainProvider implements BaseProvider {
  readonly chainId: number;
  readonly providerUrls: string[];
  readonly _provider: JsonRpcProvider | FallbackProvider;

  _isProvider: boolean = true;
  _networkPromise: Promise<Network>;
  _network: Network;
  _events: Event[];
  formatter: Formatter;
  _emitted: { [eventName: string]: number | "pending"; };
  _pollingInterval: number;
  _poller: NodeJS.Timer = setInterval(() => {}, this.pollingInterval);
  _bootstrapPoll: NodeJS.Timer = setInterval(() => {}, this.pollingInterval);
  _lastBlockNumber: number = -1;
  _fastBlockNumber: number = -1;
  _fastBlockNumberPromise: Promise<number> = new Promise((res, rej) => {res(-1)});
  _fastQueryDate: number = -1;
  _maxInternalBlockNumber: number = -1
  _internalBlockNumber: Promise<{ blockNumber: number; reqTime: number; respTime: number; }> = new Promise((res, rej) => {});
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

    // @TODO: These were copied directly from BaseProvider constructor, since they are required to
    // do an implements in this case. Is there a better way to wrap BaseProvider?
    this._events = [];
    this._emitted = { block: -2 };
    this.formatter = BaseProvider.getFormatter();
    this._maxInternalBlockNumber = -1024;
    this._lastBlockNumber = -2;
    this._pollingInterval = 4000;
    this._fastQueryDate = 0;
    this._networkPromise = provider.getNetwork();
    this._network = provider.network;

    this._provider = provider;
    this.chainId = chainId;
    this.providerUrls = providerUrls;

    // for (var member in BaseProvider) {
    //   if (typeof BaseProvider[member] === "function") {
    //     // if (T.hasOwnProperty(member)) {
    //     this[member] = this._provider[member];
    //     // }
    //   }
    // }

    // Object.assign(this, this._provider); -> TypeError: Cannot assign to read only property '_isProvider' of object '#<ChainProvider>'
    // for (var key in Object.keys(this._provider)) {
    //   console.log("DEBUG MESSAGE:")
    //   console.log(key, this._provider[key]);
    //   if (typeof this._provider[key] == "function") {
    //     Object.assign(this, {
    //       key: this._provider[key]
    //     });
    //     console.log(this[key]);
    //   }
    // }
  }

  send(method: string, params: any[]): Promise<any> {
    if (this._provider instanceof JsonRpcProvider) {
      return (this._provider as JsonRpcProvider).send(method, params);
    } else {
      const providers = (this._provider as FallbackProvider).providerConfigs.map(p => p.provider);
      return new Promise((resolve, reject) => {
        var errors: any[] = [];
        for (let i = 0; i < providers.length; i++) {
          try {
            resolve((providers[i] as JsonRpcProvider).send(method, params));
          } catch (e) {
            errors.push(e);
          }
        }
        reject(errors);
      });
    }
  }


  async call(transaction: Deferrable<TransactionRequest>, blockTag?: BlockTag | Promise<BlockTag>): Promise<string> {
    return this._provider.call(transaction, blockTag);
  }

  async estimateGas(transaction: Deferrable<TransactionRequest>): Promise<BigNumber> {
    return this._provider.estimateGas(transaction);
  }

  _wrapTransaction(tx: Transaction, hash?: string): TransactionResponse {
    return this._provider._wrapTransaction(tx, hash);
  }

  async _getTransactionRequest(transaction: Deferrable<TransactionRequest>): Promise<Transaction> {
    return this._provider._getTransactionRequest(transaction);
  }

  _ready(): Promise<Network> {
    return this._provider._ready();
  }
  get ready(): Promise<Network> {
    return this._provider.ready;
  }
  _getInternalBlockNumber(maxAge: number): Promise<number> {
    return this._provider._getInternalBlockNumber(maxAge);
  }
  poll(): Promise<void> {
    return this._provider.poll();
  }
  resetEventsBlock(blockNumber: number): void {
    return this._provider.resetEventsBlock(blockNumber);
  }
  get network(): Network {
    return this._provider.network;
  }
  detectNetwork(): Promise<Network> {
    return this._provider.detectNetwork();
  }
  getNetwork(): Promise<Network> {
    return this._provider.getNetwork();
  }
  get blockNumber(): number {
    return this._provider.blockNumber;
  }
  get polling(): boolean {
    return this._provider.polling;
  }
  set polling(value: boolean) {
    this._provider.polling = value;
  }
  get pollingInterval(): number {
    return this._provider.pollingInterval;
  }
  set pollingInterval(value: number) {
    this._provider.pollingInterval = value;
  }
  _getFastBlockNumber(): Promise<number> {
    return this._provider._getFastBlockNumber();
  }
  _setFastBlockNumber(blockNumber: number): void {
    return this._provider._setFastBlockNumber(blockNumber);
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
  _getFilter(filter: Filter | FilterByBlockHash | Promise<Filter | FilterByBlockHash>): Promise<Filter | FilterByBlockHash> {
    return this._provider._getFilter(filter);
  }
  _getAddress(addressOrName: string | Promise<string>): Promise<string> {
    return this._provider._getAddress(addressOrName)
  }
  _getBlock(blockHashOrBlockTag: BlockTag | Promise<BlockTag>, includeTransactions?: boolean): Promise<Block | BlockWithTransactions> {
    return this._provider._getBlock(blockHashOrBlockTag, includeTransactions)
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
  _getBlockTag(blockTag: BlockTag | Promise<BlockTag>): Promise<BlockTag> {
    return this._provider._getBlockTag(blockTag);
  }
  getResolver(name: string): Promise<Resolver> {
    return this._provider.getResolver(name);
  }
  _getResolver(name: string): Promise<string> {
    return this._provider._getResolver(name);
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
  _startEvent(event: Event): void {
    return this._provider._startEvent(event);
  }
  _stopEvent(event: Event): void {
    return this._provider._stopEvent(event);
  }
  _addEventListener(eventName: EventType, listener: Listener, once: boolean): this {
    this._provider._addEventListener(eventName, listener, once);
    return this;
  }
  on(eventName: EventType, listener: Listener): this {
    this._provider.on(eventName, listener);
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
  off(eventName: EventType, listener?: Listener): this {
    this._provider.off(eventName, listener);
    return this;
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