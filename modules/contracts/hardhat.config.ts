import "@nomiclabs/hardhat-waffle";
import "hardhat-typechain";
import { getEthProvider } from "@connext/vector-utils";
import { Wallet } from "@ethersproject/wallet";
import { task } from "hardhat/config";
import { HardhatUserConfig } from "hardhat/types";

import { getAddressBook } from "./src.ts/addressBook";
import { migrate } from "./src.ts/actions/migrate";
import * as packageJson from "./package.json";

////////////////////////////////////////
/// Parse Env

// TODO: how do we get network details here?
const ethProviderUrl = process.env.ETH_PROVIDER_URL ??  "http://localhost:8545";

const apiKey = process.env.API_KEY ??  "abc123";
const addressBookPath = process.env.ADDRESS_BOOK ??  "/tmp/address-book.json";
const mnemonic =
  process.env.SUGAR_DADDY ??
  process.env.MNEMONIC ??
  "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";

////////////////////////////////////////
/// Define Tasks

task("migrate", "Migrates vector contracts").setAction(async () => {
  const wallet = Wallet.fromMnemonic(mnemonic).connect(getEthProvider(ethProviderUrl));
  const addressBook = getAddressBook(
    addressBookPath,
    (await wallet.provider.getNetwork()).chainId.toString(),
  );
  await migrate(wallet, addressBook);

});

////////////////////////////////////////
/// Export Config

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
    rinkeby: {
      chainId: 4,
      url: `https://eth-rinkeby.alchemyapi.io/jsonrpc/${apiKey}`,
      accounts: { mnemonic },
    },
    matic: {
      chainId: 80001,
      url: "https://rpc-mumbai.matic.today",
      accounts: { mnemonic },
    },
  },
};

export default config;
