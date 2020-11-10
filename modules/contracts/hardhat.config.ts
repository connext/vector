import { HardhatUserConfig } from "hardhat/types";
import { BigNumber } from "ethers";

import * as packageJson from "./package.json";

// for deposit tests, you will need an account that
// holds the maximum uint256 value

// create accounts with the default balance of MAX_INT / 2
// and use them to fund accounts in the test as needed
const MAX_INT = BigNumber.from(2)
  .pow(256)
  .sub(1);

const mnemonic =
  process.env.SUGAR_DADDY ??
  process.env.MNEMONIC ??
  "decade defense poverty plastic squeeze robust peace exact more parade brother argue";

import "@nomiclabs/hardhat-waffle";

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
    ganache: {
      chainId: 1337,
      url: "http://localhost:8545",
    },
    hardhat: {
      chainId: 1338,
      loggingEnabled: false,
      accounts: {
        mnemonic,
        accountsBalance: MAX_INT.div(2).toString(),
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
