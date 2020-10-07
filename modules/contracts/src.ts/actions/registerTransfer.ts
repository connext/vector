import { RegisteredTransfer } from "@connext/vector-types";
import { getEthProvider } from "@connext/vector-utils";
import { Contract, Wallet } from "ethers";
import { Argv } from "yargs";

import { TransferDefinition, TransferRegistry } from "../artifacts";
import { cliOpts } from "../constants";
import { getAddressBook } from "../utils";

export const registerTransfer = async (
  transferName: string,
  wallet: Wallet,
  addressBookPath: string,
  silent = false,
): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const log = silent ? () => {} : console.log;

  ////////////////////////////////////////
  // Environment Setup

  const chainId = process?.env?.REAL_CHAIN_ID || (await wallet.provider.getNetwork()).chainId;

  log(`\nPreparing to add ${transferName} to registry on chainId: ${chainId}`);
  log(`Sender address=${wallet.address}`);

  const addressBook = getAddressBook(addressBookPath, chainId.toString());

  ////////////////////////////////////////
  // Add transfer
  const registry = new Contract(addressBook.getEntry("TransferRegistry").address, TransferRegistry.abi, wallet);
  const transferEntry = addressBook.getEntry(transferName);
  if (!transferEntry) {
    throw new Error(`No transfer found in address-book, cannot add`);
  }

  // Check if transfer is already in registry
  const registered = await registry.getTransferDefinitions();
  const entry = registered.find((info: RegisteredTransfer) => info.name === transferName);
  if (entry) {
    log(`Transfer ${transferName} already registered at ${entry.definition}, doing nothing`);
    log("\nAll done!");
    return;
  }

  log(`Getting registry information for ${transferName} at ${transferEntry.address}`);
  const transfer = await new Contract(transferEntry.address, TransferDefinition.abi, wallet).getRegistryInformation();
  log(`Adding transfer to registry ${JSON.stringify(transfer)}`);
  const response = await registry.addTransferDefinition(transfer);
  log(`Added: ${response.hash}`);
  await response.wait();
  log("\nAll done!");
};

export const registerTransferCommand = {
  command: "register-transfer",
  describe: "Adds transfer to registry",
  builder: (yargs: Argv): Argv => {
    return yargs
      .option("t", cliOpts.transferName)
      .option("a", cliOpts.addressBook)
      .option("m", cliOpts.mnemonic)
      .option("p", cliOpts.ethProvider)
      .option("s", cliOpts.silent);
  },
  handler: async (argv: { [key: string]: any } & Argv["argv"]): Promise<void> => {
    await registerTransfer(
      argv.transferName,
      Wallet.fromMnemonic(argv.mnemonic).connect(getEthProvider(argv.ethProvider)),
      argv.addressBook,
      argv.silent,
    );
  },
};
