import { getEthProvider } from "@connext/vector-utils";
import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";
import { Argv } from "yargs";

import { TestChannel, VectorChannel } from "../artifacts";
import { cliOpts, logger } from "../constants";
import { getContract } from "../utils";

export const createChannel = async (
  bobAddress: string,
  alice: Wallet,
  log = logger.child({}),
  test = false,
): Promise<Contract> => {
  log.info(`Preparing to create a channel for alice=${alice.address} and bob=${bobAddress}`);
  const channelFactory = await getContract("ChannelFactory", alice);
  const channelAddress = await channelFactory.getChannelAddress(alice.address, bobAddress);
  const channelCode = await alice.provider.getCode(channelAddress);
  if (channelCode === "0x" || channelCode === "0x00") {
    await (await channelFactory.createChannel(alice.address, bobAddress)).wait();
    log.info(`Successfully created a channel at ${channelAddress}`);
  } else {
    log.info(`Channel already exists at ${channelAddress}`);
  }
  return test
    ? new Contract(channelAddress, TestChannel.abi, alice)
    : new Contract(channelAddress, VectorChannel.abi, alice);
};

export const createChannelCommand = {
  command: "create-channel",
  describe: "Creates a new channel for the two counterparties",
  builder: (yargs: Argv): Argv => {
    return yargs
      .option("c", cliOpts.bobAddress)
      .option("m", cliOpts.mnemonic)
      .option("p", cliOpts.ethProvider)
      .option("s", cliOpts.silent);
  },
  handler: async (argv: { [key: string]: any } & Argv["argv"]): Promise<void> => {
    const wallet = Wallet.fromMnemonic(argv.mnemonic).connect(getEthProvider(argv.ethProvider));
    const level = argv.silent ? "silent" : "info";
    await createChannel(argv.transferName, wallet, logger.child({ level }));
  },
};
