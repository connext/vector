import { Contract } from "@ethersproject/contracts";
import { Wallet } from "@ethersproject/wallet";

import { TestChannel, VectorChannel } from "../artifacts";
import { logger } from "../constants";
import { getContract } from "../utils";

export const createChannel = async (
  bobAddress: string,
  alice: Wallet,
  log = logger.child({}),
  test = false,
): Promise<Contract> => {
  log.info(`Preparing to create a channel for alice=${alice.address} and bob=${bobAddress}`);
  const channelFactory = await getContract(test ? "TestChannelFactory" : "ChannelFactory", alice);
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
