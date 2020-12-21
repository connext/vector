import "@nomiclabs/hardhat-waffle";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "hardhat-typechain";
import { HardhatUserConfig } from "hardhat/types";

import * as packageJson from "./package.json";
import "./src.ts/tasks";

const urlOverride = process.env.ETH_PROVIDER_URL;
const chainId = parseInt(process.env.CHAIN_ID ?? "1337", 10);

const mnemonic =
  process.env.SUGAR_DADDY ||
  process.env.MNEMONIC ||
  "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";

const config: HardhatUserConfig = {
  paths: {
    artifacts: "./artifacts",
    deploy: "./deploy",
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
  namedAccounts: {
    deployer: { default: 0 },
    alice: { default: 1 },
    bob: { default: 2 },
    rando: { default: 3 },
  },
  networks: {
    hardhat: {
      accounts: {
        accountsBalance: "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        mnemonic,
      },
      chainId,
      loggingEnabled: false,
      saveDeployments: false,
    },
    localhost: {
      accounts: {
        accountsBalance: "0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
        mnemonic,
      },
      chainId,
      loggingEnabled: false,
      saveDeployments: false,
      url: urlOverride || "http://localhost:8545",
    },
    matic: {
      accounts: { mnemonic },
      chainId: 80001,
      url: urlOverride || "https://rpc-mumbai.matic.today",
    },
    rinkeby: {
      accounts: { mnemonic },
      chainId: 4,
      url: urlOverride || "http://localhost:8545",
    },
  },
};

export default config;
