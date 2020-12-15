import { BigNumber } from "@ethersproject/bignumber";

// Declare timeout values
export const DEFAULT_TRANSFER_TIMEOUT = 60 * 60 * 24; // 24 hrs
export const MINIMUM_TRANSFER_TIMEOUT = DEFAULT_TRANSFER_TIMEOUT / 2; // 12 hrs
export const MAXIMUM_TRANSFER_TIMEOUT = DEFAULT_TRANSFER_TIMEOUT * 2; // 48 hrs

export const DEFAULT_CHANNEL_TIMEOUT = DEFAULT_TRANSFER_TIMEOUT * 2; // 48 hrs
export const MINIMUM_CHANNEL_TIMEOUT = DEFAULT_CHANNEL_TIMEOUT / 2; // 24 hrs
export const MAXIMUM_CHANNEL_TIMEOUT = DEFAULT_CHANNEL_TIMEOUT * 7; // 337 hrs

export const TRANSFER_DECREMENT = 60 * 72; // 72 mins, must be greater than min which means we can have up to 10 hops.

// Get max int for offchain ensuring there is no timeout overflow during
// adjudication
export const UINT_MAX = BigNumber.from("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff").toString();

// For some chains it is best to auto-deploy the multisig rather than
// use create2
export const ARBITRUM_TESTNET_1_CHAIN_ID = 152709604825713;
export const AUTODEPLOY_CHAIN_IDS = [ARBITRUM_TESTNET_1_CHAIN_ID];
