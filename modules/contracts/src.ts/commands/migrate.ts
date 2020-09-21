import { getEthProvider } from "@connext/vector-utils";
import { constants, Contract, providers, utils, Wallet } from "ethers";
import { Argv } from "yargs";

import { getAddressBook } from "../address-book";
import { artifacts } from "../artifacts";
import { cliOpts, ConstructorArgs } from "../constants";
import { isContractDeployed, deployContract } from "../deploy";

const { EtherSymbol, Zero } = constants;
const { formatEther } = utils;

export const migrate = async (wallet: Wallet, addressBookPath: string): Promise<void> => {
  ////////////////////////////////////////
  // Environment Setup

  const chainId = process?.env?.REAL_CHAIN_ID || (await wallet.provider.getNetwork()).chainId;
  const balance = await wallet.getBalance();
  const nonce = await wallet.getTransactionCount();
  const providerUrl = (wallet.provider as providers.JsonRpcProvider).connection.url;

  console.log(`\nPreparing to migrate contracts to provider ${providerUrl} w chainId: ${chainId}`);
  console.log(
    `Deployer address=${wallet.address} nonce=${nonce} balance=${formatEther(balance)}`,
  );

  if (balance.eq(Zero)) {
    throw new Error(
      `Account ${wallet.address} has zero balance on chain ${chainId}, aborting contract migration`,
    );
  }

  const addressBook = getAddressBook(addressBookPath, chainId.toString());

  ////////////////////////////////////////
  // Deploy contracts

  const deployHelper = async (name: string, args: ConstructorArgs): Promise<Contract> => {
    const savedAddress = addressBook.getEntry(name)["address"];
    if (
      savedAddress &&
      (await isContractDeployed(name, savedAddress, addressBook, wallet.provider))
    ) {
      console.log(`${name} is up to date, no action required. Address: ${savedAddress}`);
      return new Contract(savedAddress, artifacts[name].abi, wallet);
    } else {
      return await deployContract(name, args || [], wallet, addressBook);
    }
  };

  const mastercopy = await deployHelper("VectorChannel", []);
  await deployHelper("ChannelManager", [
    { name: "mastercopy", value: mastercopy.address },
  ]);

  // Transfers
  await deployHelper("TransferDefinition", []);
  await deployHelper("LinkedTransfer", []);
  await deployHelper("Withdraw", []);

  ////////////////////////////////////////
  // Print summary

  console.log("\nAll done!");
  const spent = formatEther(balance.sub(await wallet.getBalance()));
  const nTx = (await wallet.getTransactionCount()) - nonce;
  console.log(`Sent ${nTx} transaction${nTx === 1 ? "" : "s"} & spent ${EtherSymbol} ${spent}`);
};

export const migrateCommand = {
  command: "migrate",
  describe: "Migrate contracts",
  builder: (yargs: Argv): Argv => {
    return yargs
      .option("a", cliOpts.addressBook)
      .option("m", cliOpts.mnemonic)
      .option("p", cliOpts.ethProvider);
  },
  handler: async (argv: { [key: string]: any } & Argv["argv"]): Promise<void> => {
    console.log(
      `Migration started: ethprovider - ${argv.ethProvider} | addressBook - ${argv.addressBook}`,
    );
    await migrate(
      Wallet.fromMnemonic(argv.mnemonic).connect(getEthProvider(argv.ethProvider)),
      argv.addressBook,
    );
  },
};
