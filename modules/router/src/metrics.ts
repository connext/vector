import { HydratedProviders, ERC20Abi, ChainInfo } from "@connext/vector-types";
import { hydrateProviders, getChainInfo, getAssetName } from "@connext/vector-utils";
import { BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { formatEther, formatUnits } from "@ethersproject/units";
import { Wallet } from "@ethersproject/wallet";
import { Counter, Gauge } from "prom-client";

import { config } from "./config";

//////////////////////////
///// Router Metrics /////
/////////////////////////

//////////////////////////
///// Helpers/Utils
export const wallet = Wallet.fromMnemonic(config.mnemonic);
export const signerAddress = wallet.address;
export const hydrated: HydratedProviders = hydrateProviders(config.chainProviders);
export const rebalancedTokens: {
  [chainId: string]: {
    [assetId: string]: {
      contract: Contract;
      decimals?: number;
    };
  };
} = {};
Object.entries(hydrated).forEach(async ([chainId, provider]) => {
  rebalancedTokens[chainId] = {};
  const assets = config.rebalanceProfiles
    .filter((prof) => prof.chainId.toString() === chainId && prof.assetId !== AddressZero)
    .map((p) => p.assetId);

  assets.forEach((asset) => {
    rebalancedTokens[chainId][asset] = {
      contract: new Contract(asset, ERC20Abi, provider),
      decimals: undefined,
    };
  });
});

export const getDecimals = async (chainId: string, assetId: string): Promise<number> => {
  if (assetId === AddressZero) {
    return 18;
  }
  const { decimals: _decimals, contract } = rebalancedTokens[chainId][assetId];
  if (_decimals) {
    return _decimals;
  }
  let decimals = 18;
  try {
    decimals = await contract.decimals();
  } catch (e) {
    // default to 18
  }
  rebalancedTokens[chainId][assetId].decimals = decimals;
  return decimals;
};

export const parseBalanceToNumber = async (
  toFormat: BigNumberish,
  chainId: string,
  assetId: string,
): Promise<number> => {
  if (assetId === AddressZero) {
    return parseFloat(formatEther(toFormat));
  }
  const decimals = await getDecimals(chainId, assetId);
  return parseFloat(formatUnits(toFormat, decimals));
};

//////////////////////////
///// Onchain liquidity

// TODO: add asset name label
export const onchainLiquidity = new Gauge({
  name: "router_onchain_liquidity",
  help: "router_onchain_liquidity_help",
  labelNames: ["chainName", "chainId", "assetName", "assetId"] as const,
  async collect() {
    await Promise.all(
      Object.entries(hydrated).map(async ([chainId, provider]) => {
        // base asset
        const balance = await provider.getBalance(signerAddress);
        const chainInfo: ChainInfo = await getChainInfo(Number(chainId));
        const baseAssetName: string = getAssetName(Number(chainId), AddressZero);
        this.set(
          { chainName: chainInfo.name, chainId, assetName: baseAssetName, assetId: AddressZero },
          parseFloat(formatEther(balance)),
        );

        // tokens
        await Promise.all(
          Object.entries(rebalancedTokens[chainId] ?? {}).map(async ([assetId, config]) => {
            const balance = await config.contract.balanceOf(signerAddress);
            const assetName: string = getAssetName(Number(chainId), assetId);
            const toSet = await parseBalanceToNumber(balance, chainId, assetId);
            this.set({ chainName: chainInfo.name, chainId, assetName, assetId }, toSet);
          }),
        );
      }),
    );
  },
});

//////////////////////////
///// Offchain liquidity
export const offchainLiquidity = new Gauge({
  name: "router_offchain_liquidity",
  help: "router_offchain_liquidity_help",
  labelNames: ["assetId", "chainId"] as const,
});

//////////////////////////
///// Channel metrics
export const openChannels = new Counter({
  name: "router_channels",
  help: "router_channels_help",
  labelNames: ["chainId"] as const,
});

//////////////////////////
///// Transfer metrics
// Track number of times a transfer attempt was made
export const attemptedTransfer = new Counter({
  name: "router_transfer_attempt",
  help: "router_transfer_attempt_help",
  labelNames: ["assetId", "chainId"] as const,
});

// Track successful transfers
export const successfulTransfer = new Counter({
  name: "router_transfer_successful",
  help: "router_transfer_successful_help",
  labelNames: ["assetId", "chainId"] as const,
});

// Track failing forwards
export const failedTransfer = new Counter({
  name: "router_transfer_failed",
  help: "router_transfer_failed_help",
  labelNames: ["assetId", "chainId"] as const,
});

// Track volume from receiver side
export const forwardedVolume = new Gauge({
  name: "router_transfer_volume",
  help: "router_transfer_volume_help",
  labelNames: ["assetId", "chainId"] as const,
});

//////////////////////////
///// Transaction metrics
// TODO: any gas labels on txs? gas price?
// Track on chain transactions attempts
export const transactionAttempt = new Counter({
  name: "router_transaction_attempt",
  help: "router_transaction_attempt_help",
  labelNames: ["reason", "chainId"] as const,
});

// Track successful on chain transactions
export const transactionSuccess = new Counter({
  name: "router_transaction_success",
  help: "router_transaction_success_help",
  labelNames: ["reason", "chainId"] as const,
});

// Track failed on chain transactions
export const transactionFailed = new Counter({
  name: "router_transaction_failed",
  help: "router_transaction_failed_help",
  labelNames: ["reason", "chainId"] as const,
});

// Track gas consumed
export const gasConsumed = new Gauge({
  name: "router_gas_consumed",
  help: "router_gas_consumed_help",
  labelNames: ["reason", "chainId"] as const,
});
