import "@nomiclabs/hardhat-waffle";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import "@nomiclabs/hardhat-etherscan";

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
  etherscan: {
    apiKey: process.env.API_KEY || "",
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
    mainnet: {
      accounts: { mnemonic },
      chainId: 1,
      url: urlOverride || "http://localhost:8545",
    },
    rinkeby: {
      accounts: { mnemonic },
      chainId: 4,
      url: urlOverride || "http://localhost:8545",
    },
    goerli: {
      accounts: { mnemonic },
      chainId: 5,
      url: urlOverride || "http://localhost:8545",
    },
    kovan: {
      accounts: { mnemonic },
      chainId: 42,
      url: urlOverride || "http://localhost:8545",
    },
    matic: {
      accounts: { mnemonic },
      chainId: 137,
      url: urlOverride || "http://localhost:8545",
    },
    mumbai: {
      accounts: { mnemonic },
      chainId: 80001,
      url: urlOverride || "https://rpc-mumbai.matic.today",
    },
    arbitrumtest: {
      accounts: { mnemonic },
      chainId: 79377087078960,
      url: urlOverride || "https://kovan3.arbitrum.io/rpc",
    },
    xdai: {
      accounts: { mnemonic },
      chainId: 100,
      url: urlOverride || "http://localhost:8545",
    },
    bsctestnet: {
      accounts: { mnemonic },
      chainId: 97,
      url: urlOverride || "https://data-seed-prebsc-1-s1.binance.org:8545/",
    },
    bsc: {
      accounts: { mnemonic },
      chainId: 56,
      url: urlOverride || "https://bsc-dataseed.binance.org/",
    },
    hecotestnet: {
      accounts: { mnemonic },
      chainId: 256,
      url: urlOverride || "https://http-testnet.hecochain.com",
    },
    heco: {
      accounts: { mnemonic },
      chainId: 128,
      url: urlOverride || "https://http-mainnet.hecochain.com",
    },
    avalanchefuji: {
      accounts: { mnemonic },
      chainId: 43113,
      url: urlOverride || "https://api.avax-test.network/ext/bc/C/rpc",
    },
    avalanche: {
      accounts: { mnemonic },
      chainId: 43114,
      url: urlOverride || "https://api.avax.network/ext/bc/C/rpc",
    },
    fantomtestnet: {
      accounts: { mnemonic },
      chainId: 4002,
      url: urlOverride || "https://rpc.testnet.fantom.network/",
    },
    fantom: {
      accounts: { mnemonic },
      chainId: 250,
      url: urlOverride || "https://rpcapi.fantom.network",
    },
  },
};

export default config;
