export { EthereumChainReader as VectorChainReader } from "./ethReader";
export { EthereumChainService as VectorChainService, EXTRA_GAS_PRICE, waitForTransaction } from "./ethService";

/*
const harmonyChainIds = [];

import { EthereumChainReader } from "./ethReader";
import { EthereumChainService } from "./ethService";
import { HarmonyChainService } from "./hmyService";

export class VectorChainReader implements IVectorChainReader {
  private chainReaders: { [chainId: string]: providers.JsonRpcProvider } = {};
  constructor(
    private readonly chainProviders: { [chainId: string]: providers.JsonRpcProvider },
    private readonly log: BaseLogger,
  ) {
    const ethReader = new EthereumChainReader(chainProviders, log);
    const hmyReader = new HarmonyChainService(chainProviders, log);
    Object.entries(chainProviders).forEach(([chainId, provider]) => {
      if (harmonyChainIds.includes(chainId)) {
        chainReaders[chainId] = hmyReader;
      } else {
        chainReaders[chainId] = ethReader;
      }
    });
  }
  getChannelOnchainBalance = (...args) => this.chainReaders[chainId].getChannelOnchainBalance(args);
  getTotalDepositedA = (...args) => this.chainReaders[chainId].getTotalDepositedA(args);
  getTotalDepositedB = (...args) => this.chainReaders[chainId].getTotalDepositedB(args);
  getChannelAddress = (...args) => this.chainReaders[chainId].getChannelAddress(args);
  create = (...args) => this.chainReaders[chainId].create(args);
  resolve = (...args) => this.chainReaders[chainId].resolve(args);
  getCode = (...args) => this.chainReaders[chainId].getCode(args);
}
*/
