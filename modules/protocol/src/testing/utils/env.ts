import { ChainProviders } from "@connext/vector-types";

export const env: { chainProviders: ChainProviders; chainAddresses: any; logLevel?: string } = {
  chainAddresses: JSON.parse(process.env.CONTRACT_ADDRESSES ?? "{}"),
  chainProviders: JSON.parse(process.env.CHAIN_PROVIDERS ?? '{"1337":"http://localhost:8545"}'),
  logLevel: process.env.LOG_LEVEL || "silent",
};
