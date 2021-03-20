import {
  HydratedProviders,
  ERC20Abi,
  ChainInfo,
  TransactionReason,
  IVectorChainReader,
  jsonifyError,
} from "@connext/vector-types";
import {
  hydrateProviders,
  getChainInfo,
  getAssetName,
  getMainnetEquivalent,
  getExchangeRateInEth,
  calculateExchangeWad,
} from "@connext/vector-utils";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { formatEther, formatUnits } from "@ethersproject/units";
import { Wallet } from "@ethersproject/wallet";
import { BaseLogger } from "pino";
import { Counter, Gauge } from "prom-client";

import { getConfig } from "./config";

const config = getConfig();

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

export const incrementGasCosts = async (
  gasUsed: string,
  chainId: number,
  reason: TransactionReason,
  ethReader: IVectorChainReader,
  logger: BaseLogger,
): Promise<void> => {
  // Increment the gas cost without any normalizing
  gasConsumed.inc({ chainId, reason }, await parseBalanceToNumber(gasUsed, chainId.toString(), AddressZero));

  // Normalize the gas amounts to mainnet eth prices
  const mainnetEquivalent = getMainnetEquivalent(chainId, AddressZero);
  if (mainnetEquivalent.isError) {
    logger.warn(
      { error: mainnetEquivalent.getError()!.message, chainId, assetId: AddressZero },
      "No mainnet equivalent, cannot normalize",
    );
    return;
  }

  // Get exchange rate (token : eth)
  const rate = await getExchangeRateInEth(mainnetEquivalent.getValue(), logger);
  if (rate.isError) {
    logger.warn({ error: rate.getError()?.message }, "Failed to get exchange rate");
    return;
  }

  // Normalize to eth cost
  const gasPrice = await ethReader.getGasPrice(chainId);
  if (gasPrice.isError) {
    logger.warn({ ...jsonifyError(gasPrice.getError()!), chainId }, "Failed to get gasPrice");
    return;
  }
  const ethFee = calculateExchangeWad(
    gasPrice.getValue().mul(gasUsed),
    await getDecimals("1", mainnetEquivalent.getValue()),
    rate.getValue().toString(),
    18,
  );

  // Increment fees in eth
  mainnetGasCost.inc({ chainId, reason }, await parseBalanceToNumber(ethFee, "1", AddressZero));
  logger.debug(
    {
      gasUsed,
      chainId,
      reason,
      mainnetEquivalent: mainnetEquivalent.getValue(),
      gasPrice: gasPrice.getValue().toString(),
      ethFee: ethFee.toString(),
    },
    "Incremented gas fees",
  );
};

export const incrementFees = async (
  feeAmount: string,
  feeAssetId: string,
  feeChainId: number,
  logger: BaseLogger,
): Promise<void> => {
  // First increment fees in native asset
  feesCollected.inc(
    {
      chainId: feeChainId,
      assetId: feeAssetId,
    },
    await parseBalanceToNumber(feeAmount, feeChainId.toString(), feeAssetId),
  );

  // Get the mainnet equivalent
  const mainnetEquivalent = getMainnetEquivalent(feeChainId, feeAssetId);
  if (mainnetEquivalent.isError) {
    logger.warn(
      { error: mainnetEquivalent.getError()!.message, assetId: feeAssetId, chainId: feeChainId },
      "No mainnet equivalent, cannot normalize",
    );
    return;
  }

  // Get exchange rate (token : eth)
  const rate = await getExchangeRateInEth(mainnetEquivalent.getValue(), logger);
  if (rate.isError) {
    logger.warn({ error: rate.getError()?.message }, "Failed to get exchange rate");
    return;
  }

  // Get equivalent eth amount
  const ethFee = calculateExchangeWad(
    BigNumber.from(feeAmount),
    await getDecimals("1", mainnetEquivalent.getValue()),
    rate.getValue().toString(),
    18,
  );
  mainnetFeesCollectedInEth.inc(
    { chainId: feeChainId, assetId: feeAssetId },
    await parseBalanceToNumber(ethFee, "1", AddressZero),
  );
  logger.debug(
    {
      feeAmount,
      chainId: feeChainId,
      assetId: feeAssetId,
      mainnetEquivalent: mainnetEquivalent.getValue(),
      ethFee: ethFee.toString(),
    },
    "Incremented collected fees",
  );
};

//////////////////////////
///// Onchain liquidity

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
          { chainName: chainInfo?.name ?? chainId, chainId, assetName: baseAssetName, assetId: AddressZero },
          parseFloat(formatEther(balance)),
        );

        // tokens
        await Promise.all(
          Object.entries(rebalancedTokens[chainId] ?? {}).map(async ([assetId, config]) => {
            const balance = await config.contract.balanceOf(signerAddress);
            const assetName: string = getAssetName(Number(chainId), assetId);
            const toSet = await parseBalanceToNumber(balance, chainId, assetId);
            this.set({ chainName: chainInfo?.name ?? chainId, chainId, assetName, assetId }, toSet);
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
export const forwardedTransferVolume = new Counter({
  name: "router_transfer_volume",
  help: "router_transfer_volume_help",
  labelNames: ["assetId", "chainId"] as const,
});

// Track size of forwarded transfers
export const forwardedTransferSize = new Gauge({
  name: "router_transfer_size",
  help: "router_transfer_size_help",
  labelNames: ["assetId", "chainId"] as const,
});

// Track fees charged on transfers
export const feesCollected = new Counter({
  name: "router_fees",
  help: "router_fees_help",
  labelNames: ["assetId", "chainId"] as const,
});

// Track fees charged on transfers in eth where possible
// NOTE: it is only possible to calculate fees when one of
// the sides of the swap touches mainnet. Otherwise, we cannot
// get the token:eth exchange rate to normalize the fees.
export const mainnetFeesCollectedInEth = new Counter({
  name: "router_mainnet_eth_fees",
  help: "router_mainnet_eth_fees_help",
  labelNames: ["assetId", "chainId"] as const,
});

//////////////////////////
///// Transaction metrics
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
export const gasConsumed = new Counter({
  name: "router_gas_consumed",
  help: "router_gas_consumed_help",
  labelNames: ["reason", "chainId"] as const,
});

// Track gas consumed on mainnet in eth
export const mainnetGasCost = new Counter({
  name: "router_mainnet_gas_cost",
  help: "router_mainnet_gas_cost_help",
  labelNames: ["reason", "chainId"] as const,
});
