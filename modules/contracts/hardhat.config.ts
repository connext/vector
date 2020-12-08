import "@nomiclabs/hardhat-waffle";
import "hardhat-deploy";
import "hardhat-typechain";
import { HardhatUserConfig } from "hardhat/types";

import * as packageJson from "./package.json";

const chainId = parseInt(process.env.CHAIN_ID ?? "1337", 10);

const mnemonic =
  process.env.SUGAR_DADDY ??
  process.env.MNEMONIC ??
  "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";

const config: HardhatUserConfig = {
  paths: {
    artifacts: "./artifacts",
    deploy: "./src.ts/deploy",
    deployments: "./deployments",
    sources: "./src.sol",
    tests: "./src.ts",
  },
  solidity: {
    version: packageJson.devDependencies.solc,
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      chainId,
      loggingEnabled: false,
      accounts: {
        mnemonic,
        accountsBalance: "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      },
    },
    matic: {
      chainId: 80001,
      url: "https://rpc-mumbai.matic.today",
      accounts: { mnemonic },
    },
  },
};

export default config;
