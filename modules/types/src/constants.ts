export const DEFAULT_TRANSFER_TIMEOUT = 8640; // 6 blocks per min (ethereum) * 60 mins * 24h
export const MINIMUM_TRANSFER_TIMEOUT = DEFAULT_TRANSFER_TIMEOUT / 2;
export const TRANSFER_DECREMENT = 432; // 72 mins, must be greater than min which means we can have up to 10 hops.
export const ARBITRUM_TESTNET_1_CHAIN_ID = 152709604825713;
export const AUTODEPLOY_CHAIN_IDS = [ARBITRUM_TESTNET_1_CHAIN_ID];
