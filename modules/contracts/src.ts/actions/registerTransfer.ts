import { RegisteredTransfer, tidy } from "@connext/vector-types";
import { getEthProvider } from "@connext/vector-utils";
import { Wallet } from "ethers";
import { Argv } from "yargs";

import { AddressBook, getAddressBook } from "../addressBook";
import { cliOpts } from "../constants";

export const registerTransfer = async (
  transferName: string,
  wallet: Wallet,
  addressBook: AddressBook,
  silent = false,
): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const log = silent ? () => {} : console.log;

  log(`\nPreparing to add ${transferName} to registry (Sender=${wallet.address})`);

  ////////////////////////////////////////
  // Add transfer

  const registry = addressBook.getContract("TransferRegistry");
  const registered = await registry.getTransferDefinitions();

  const transfer = addressBook.getContract(transferName);
  const transferInfo = await transfer.getRegistryInformation();

  // Check if transfer is already in registry
  const entry = registered.find((info: RegisteredTransfer) => info.name === transferName);
  if (entry) {
    log(`Transfer ${transferName} has already been registered`);
    return;
  }

  log(`Getting registry information for ${transferName} at ${transfer.address}`);

  // Sanity-check: tidy return value
  const cleaned = {
    name: transferInfo.name,
    definition: transferInfo.definition,
    resolverEncoding: tidy(transferInfo.resolverEncoding),
    stateEncoding: tidy(transferInfo.stateEncoding),
  };
  log(`Adding transfer to registry ${JSON.stringify(cleaned, null, 2)}`);
  const response = await registry.addTransferDefinition(cleaned);
  log(`Added: ${response.hash}`);
  await response.wait();
  log(`Tx mined, successfully added ${cleaned.name} on ${cleaned.definition}`);
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
    const wallet = Wallet.fromMnemonic(argv.mnemonic).connect(getEthProvider(argv.ethProvider));
    const addressBook = getAddressBook(
      argv.addressBook,
      process?.env?.REAL_CHAIN_ID || (await wallet.provider.getNetwork()).chainId.toString(),
    );
    await registerTransfer(argv.transferName, wallet, addressBook, argv.silent);
  },
};
