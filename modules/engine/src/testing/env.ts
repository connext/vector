import { ChainProviders } from "@connext/vector-types";
import { Wallet } from "ethers";
import pino from "pino";

type EngineTestEnv = {
  chainProviders: ChainProviders;
  chainAddresses: any;
  sugarDaddy: Wallet;
  logLevel?: pino.Level;
};

export const env: EngineTestEnv = {
  chainAddresses: JSON.parse(process.env.CHAIN_ADDRESSES ?? "{}"),
  chainProviders: JSON.parse(process.env.CHAIN_PROVIDERS ?? '{"1337":"http://localhost:8545"}'),
  logLevel: (process.env.LOG_LEVEL || "silent") as pino.Level,
  sugarDaddy: Wallet.fromMnemonic(
    process.env.SUGAR_DADDY || "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat",
  ),
};
