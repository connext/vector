import { ChainProviders } from "./network";
import { ChainAddresses } from "./channel";

export type VectorNodeConfig = {
  adminToken: string;
  allowedSwaps: string[2][]; // [[fromAddress, toAddress], ...]
  allowedTokens: string[];
  authUrl: string;
  chainAddresses: ChainAddresses;
  chainProviders: ChainProviders;
  dbUrl: string;
  logLevel: string;
  mnemonic: string;
  natsUrl: string;
  port: number;
  redisUrl: string;
}

export type VectorRouterConfig = VectorNodeConfig & {
  defaultCollateralization: any;
}
