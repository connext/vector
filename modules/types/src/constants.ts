import { BigNumber } from "@ethersproject/bignumber";
import { parseUnits } from "@ethersproject/units";

// Declare timeout values
export const DEFAULT_TRANSFER_TIMEOUT = 60 * 60 * 24; // 24 hrs
export const MINIMUM_TRANSFER_TIMEOUT = DEFAULT_TRANSFER_TIMEOUT / 2; // 12 hrs
export const MAXIMUM_TRANSFER_TIMEOUT = DEFAULT_TRANSFER_TIMEOUT * 2; // 48 hrs

export const DEFAULT_CHANNEL_TIMEOUT = DEFAULT_TRANSFER_TIMEOUT * 2; // 48 hrs
export const MINIMUM_CHANNEL_TIMEOUT = DEFAULT_CHANNEL_TIMEOUT / 2; // 24 hrs
export const MAXIMUM_CHANNEL_TIMEOUT = DEFAULT_CHANNEL_TIMEOUT * 7; // 336 hrs

export const DEFAULT_ROUTER_SLIPPAGE_TOLERANCE = "15"; // 15 percent

export const TRANSFER_DECREMENT = 60 * 72; // 72 mins, must be greater than min which means we can have up to 10 hops.

// Get max int for offchain ensuring there is no timeout overflow during
// adjudication
export const UINT_MAX = BigNumber.from("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff").toString();

// For some chains it is best to auto-deploy the multisig rather than
// use create2
export const ARBITRUM_TESTNET_1_CHAIN_ID = 152709604825713;
export const AUTODEPLOY_CHAIN_IDS = [ARBITRUM_TESTNET_1_CHAIN_ID];

// Used by alice nodes to submit their withdrawals when gas is low
export const REDUCED_GAS_PRICE = parseUnits("125", "gwei");

// When a quote will expire
export const DEFAULT_FEE_EXPIRY = 300_000;

// number of confirmations for non-mainnet chains
export const NUM_CONFIRMATIONS = 3;
// TODO: need to stop using random chainIds in our testing, these could eventually be real chains...
export const CHAINS_WITH_ONE_CONFIRMATION = [1, 1337, 1338, 1340, 1341, 1342];
export const getConfirmationsForChain = (chainId: number): number => {
  return CHAINS_WITH_ONE_CONFIRMATION.includes(chainId) ? 1 : NUM_CONFIRMATIONS;
};

// ETH Reader - how many attempts / retries will we do upon failure?
export const ETH_READER_MAX_RETRIES = 5;

export const NATS_CLUSTER_URL =
  "nats://nats1.connext.provide.network:4222,nats://nats2.connext.provide.network:4222,nats://nats3.connext.provide.network:4222";
export const NATS_AUTH_URL = "https://messaging.connext.network";
export const NATS_WS_URL = "wss://websocket.connext.provide.network";
