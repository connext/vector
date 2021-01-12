import { ChainProviders } from "@connext/vector-types";
import { Wallet } from "@ethersproject/wallet";
import pino from "pino";

type BrowserNodeTestEnv = {
  chainProviders: ChainProviders;
  chainAddresses: any;
  sugarDaddyMnemonic: Wallet;
  logLevel?: pino.Level;
};

export const env: BrowserNodeTestEnv = {
  chainAddresses: JSON.parse(
    '{"1337":{"channelFactoryAddress":"0x345cA3e014Aaf5dcA488057592ee47305D9B3e10","testTokenAddress":"0x8CdaF0CD259887258Bc13a92C0a6dA92698644C0","transferRegistryAddress":"0x9FBDa871d559710256a2502A2517b794B482Db40"},"1338":{"channelFactoryAddress":"0x345cA3e014Aaf5dcA488057592ee47305D9B3e10","testTokenAddress":"0x8CdaF0CD259887258Bc13a92C0a6dA92698644C0","transferRegistryAddress":"0x9FBDa871d559710256a2502A2517b794B482Db40"}}',
  ),
  chainProviders: JSON.parse('{"1337":"http://localhost:8545","1338":"http://localhost:8546"}'),
  logLevel: (process.env.LOG_LEVEL || "silent") as pino.Level,
  sugarDaddyMnemonic: Wallet.fromMnemonic("candy maple cake sugar pudding cream honey rich smooth crumble sweet treat"),
};
