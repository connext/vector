import { RegisteredTransfer, tidy } from "@connext/vector-types";
import { getEthProvider } from "@connext/vector-utils";
import { Wallet } from "ethers";
import { Argv } from "yargs";

import { AddressBook, getAddressBook } from "../addressBook";
import { cliOpts, logger } from "../constants";

export const registerTransfer = async (
  transferName: string,
  wallet: Wallet,
  addressBook: AddressBook,
  log = logger.child({}),
): Promise<void> => {

  log.info(`\nPreparing to add ${transferName} to registry (Sender=${wallet.address})`);

  const registry = addressBook.getContract("TransferRegistry").connect(wallet);
  const transfer = addressBook.getContract(transferName).connect(wallet);

  const registered = await registry.getTransferDefinitions();
  const transferInfo = await transfer.getRegistryInformation();

  // Check if transfer is already in registry
  const entry = registered.find((info: RegisteredTransfer) => info.name === transferName);
  if (entry) {
    log.info(`Transfer ${transferName} has already been registered`);
    return;
  }

  log.info(`Getting registry information for ${transferName} at ${transfer.address}`);

  // Sanity-check: tidy return value
  const cleaned = {
    name: transferInfo.name,
    definition: transferInfo.definition,
    resolverEncoding: tidy(transferInfo.resolverEncoding),
    stateEncoding: tidy(transferInfo.stateEncoding),
  };
  log.info(`Adding transfer to registry ${JSON.stringify(cleaned, null, 2)}`);
  const response = await registry.addTransferDefinition(cleaned);
  log.info(`Added: ${response.hash}`);
  await response.wait();
  log.info(`Tx mined, successfully added ${cleaned.name} on ${cleaned.definition}`);
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
    const level = argv.silent ? "silent" : "info";
    await registerTransfer(argv.transferName, wallet, addressBook, logger.child({ level }));
  },
};
