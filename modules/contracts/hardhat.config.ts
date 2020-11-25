import "@nomiclabs/hardhat-waffle";
import { HardhatUserConfig } from "hardhat/types";
import "hardhat-typechain";

import * as packageJson from "./package.json";

const mnemonic =
  process.env.SUGAR_DADDY ??
  process.env.MNEMONIC ??
  "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";

const config: HardhatUserConfig = {
  paths: {
    sources: "./src.sol",
    tests: "./src.ts",
    artifacts: "./artifacts",
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
      chainId: parseInt(process.env.CHAIN_ID ?? "1337"),
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
