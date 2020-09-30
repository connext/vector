import { getEthProvider } from "@connext/vector-utils";
import { EtherSymbol, Zero } from "@ethersproject/constants";
import { Contract, providers, utils, Wallet } from "ethers";
import { Argv } from "yargs";

import { artifacts } from "../artifacts";
import { cliOpts, ConstructorArgs } from "../constants";
import { getAddressBook, isContractDeployed, deployContract } from "../utils";

const { formatEther } = utils;

export const migrate = async (
  wallet: Wallet,
  addressBookPath: string,
  silent = false,
): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const log = silent ? () => {} : console.log;

  ////////////////////////////////////////
  // Environment Setup

  const chainId = process?.env?.REAL_CHAIN_ID || (await wallet.provider.getNetwork()).chainId;
  const balance = await wallet.getBalance();
  const nonce = await wallet.getTransactionCount();
  const providerUrl = (wallet.provider as providers.JsonRpcProvider).connection.url;

  log(`\nPreparing to migrate contracts to provider ${providerUrl} w chainId: ${chainId}`);
  log(
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
      (await isContractDeployed(name, savedAddress, addressBook, wallet.provider, silent))
    ) {
      log(`${name} is up to date, no action required. Address: ${savedAddress}`);
      return new Contract(savedAddress, artifacts[name].abi, wallet);
    } else {
      return await deployContract(name, args || [], wallet, addressBook, silent);
    }
  };

  const mastercopy = await deployHelper("ChannelMastercopy", []);
  await deployHelper("ChannelFactory", [
    { name: "mastercopy", value: mastercopy.address },
  ]);

  // Transfers
  await deployHelper("LinkedTransfer", []);
  await deployHelper("Withdraw", []);

  ////////////////////////////////////////
  // Print summary

  log("\nAll done!");
  const spent = formatEther(balance.sub(await wallet.getBalance()));
  const nTx = (await wallet.getTransactionCount()) - nonce;
  log(`Sent ${nTx} transaction${nTx === 1 ? "" : "s"} & spent ${EtherSymbol} ${spent}`);
};

export const migrateCommand = {
  command: "migrate",
  describe: "Migrate contracts",
  builder: (yargs: Argv): Argv => {
    return yargs
      .option("a", cliOpts.addressBook)
      .option("m", cliOpts.mnemonic)
      .option("p", cliOpts.ethProvider)
      .option("s", cliOpts.silent);
  },
  handler: async (argv: { [key: string]: any } & Argv["argv"]): Promise<void> => {
    await migrate(
      Wallet.fromMnemonic(argv.mnemonic).connect(getEthProvider(argv.ethProvider)),
      argv.addressBook,
      argv.silent,
    );
  },
};
