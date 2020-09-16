import { ChainProviders } from "@connext/vector-types";

export const config: { chainProviders: ChainProviders; chainAddresses: any; logLevel?: string } = {
  chainProviders: JSON.parse(process.env.CHAIN_PROVIDERS ?? '{"1337":"http://localhost:8545"}'),
  logLevel: process.env.LOG_LEVEL || "info",
  chainAddresses: JSON.parse(process.env.CONTRACT_ADDRESSES ?? "{}"),
};
