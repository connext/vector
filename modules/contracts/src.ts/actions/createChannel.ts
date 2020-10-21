import { getEthProvider } from "@connext/vector-utils";
import { Contract, Wallet } from "ethers";
import { Argv } from "yargs";

import { AddressBook, getAddressBook } from "../addressBook";
import { VectorChannel } from "../artifacts";
import { cliOpts, logger } from "../constants";

export const createChannel = async (
  bobAddress: string,
  alice: Wallet,
  addressBook: AddressBook,
  log = logger.child({}),
): Promise<Contract> => {
  log.info(`\nPreparing to create a channel for alice=${alice.address} and bob=${bobAddress}`);
  const channelFactory = addressBook.getContract("ChannelFactory");
  const doneBeingCreated: Promise<string> = new Promise(res => {
    // NOTE: this takes kind of a long time to resolve.. is there any way to speed it up?
    channelFactory.once(channelFactory.filters.ChannelCreation(), res);
  });
  const chainId = (await alice.provider.getNetwork()).chainId.toString();
  const tx = await channelFactory.createChannel(alice.address, bobAddress, chainId);
  await tx.wait();
  const channelAddress = await doneBeingCreated;
  log.info(`Successfully created a channel at ${channelAddress}`);
  // Save this channel address in case we need it later
  addressBook.setEntry(
    `VectorChannel-${alice.address.substring(2, 6)}-${bobAddress.substring(2, 6)}`,
    {
      address: channelAddress,
      args: [alice.address, bobAddress, chainId],
      txHash: tx.hash,
    },
  );
  return new Contract(channelAddress, VectorChannel.abi, alice);
};

export const createChannelCommand = {
  command: "create-channel",
  describe: "Creates a new channel for the two counterparties",
  builder: (yargs: Argv): Argv => {
    return yargs
      .option("a", cliOpts.addressBook)
      .option("c", cliOpts.bobAddress)
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
    await createChannel(argv.transferName, wallet, addressBook, logger.child({ level }));
  },
};
