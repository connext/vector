import { BuidlerConfig, usePlugin } from "@nomiclabs/buidler/config";
import { BigNumber } from "ethers";

import * as packageJson from "./package.json";

// for deposit tests, you will need an account that
// holds the maximum uint256 value

// create accounts with the default balance of MAX_INT / 2
// and use them to fund accounts in the test as needed
const MAX_INT = BigNumber.from(2)
  .pow(256)
  .sub(1);

usePlugin("@nomiclabs/buidler-waffle");

const config: BuidlerConfig = {
  paths: {
    sources: "./src.sol",
    tests: "./src.ts",
    artifacts: "./artifacts",
  },
  solc: {
    version: packageJson.devDependencies.solc,
    optimizer: {
      enabled: true,
      runs: 200,
    },
  },
  defaultNetwork: "buidlerevm",
  networks: {
    ganache: {
      chainId: 1337,
      url: "http://localhost:8545",
    },
    buidlerevm: {
      chainId: 1338,
      loggingEnabled: false,
      accounts: [
        {
          // 0xebb77dCE22ae0f9003359B7f7fe7b7eA0034529d
          privateKey: "0xf8db28f19cfb75625e0c100de3de8be364f2f4a6d77ff3b3ea361b93bef625dd",
          balance: MAX_INT.div(2).toString(),
        },
        {
          // 0xbBFeca66860d78Eb9d037B0F9F6093025EF096A3
          privateKey: "0xbce6e7f2cbb131f5538b052f433b381c0738d37c3df2d667d023ee10adbb33f0",
          balance: MAX_INT.div(2).toString(),
        },
        {
          // 0x9f2Acf6dd8D083B9688113e8ee5DEfC3906ee7D8
          privateKey: "0x5454ba77acd18c6cef9dd471a7bc57d8ff261433a2c2d90049659fe68eaf1de4",
          balance: MAX_INT.div(2).toString(),
        },
        {
          // 0x7bf6714413b8829c470d549dA07B6338D0de4142
          privateKey: "0x615ff2525e11be7b323e699e720378641ea2c418d829d065e74d1fd70a44706b",
          balance: MAX_INT.div(2).toString(),
        },
        {
          // 0x691F096377eD5C63e3f43b0903EFd7a34CcC23Bf
          privateKey: "0x20a88167e85946376ba44cf26f347c2f6d3d4f6e3302bda1990355d267c22051",
          balance: MAX_INT.div(2).toString(),
        },
        {
          // 0x627306090abaB3A6e1400e9345bC60c78a8BEf57 // SUGAR DADDY
          privateKey: "0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3",
          balance: MAX_INT.div(2).toString(),
        },
      ],
    },
  },
};

export default config;
