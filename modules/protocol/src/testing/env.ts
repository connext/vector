import pino from "pino";

export const env = {
  chainAddresses: JSON.parse(process.env.CHAIN_ADDRESSES ?? "{}"),
  chainProviders: JSON.parse(process.env.CHAIN_PROVIDERS ?? '{"1337":"http://localhost:8545"}'),
  logLevel: (process.env.LOG_LEVEL || "silent") as pino.Level,
  sugarDaddyMnemonic:
    process.env.SUGAR_DADDY || "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat",
};
