import { Contract } from "@ethersproject/contracts";
import { task } from "hardhat/config";
import pino from "pino";

export default task("create-channel", "Creates a new channel")
  .addParam("aliceAddress", "The address of both the alice role AND the signer")
  .addParam("bobAddress", "The address of the channel's bob role")
  .addParam("logLevel", "One of 'debug', 'info', 'warn', 'error', 'silent' (default: silent)")
  .addParam("testMode", "If provided then create a TestChannel else create a VectorChannel")
  .setAction(async (args, hre): Promise<Contract> => {
    const { aliceAddress, bobAddress, logLevel, testMode } = args;
    const log = pino({ level: logLevel || "silent" });
    log.info(`Preparing to create a channel for alice=${aliceAddress} and bob=${bobAddress}`);
    const channelFactory = await (hre.ethers as any).getContract(testMode ? "TestChannelFactory" : "ChannelFactory", aliceAddress);
    const channelAddress = await channelFactory.getChannelAddress(aliceAddress, bobAddress);
    const channelCode = await hre.ethers.provider.getCode(channelAddress);
    if (channelCode === "0x" || channelCode === "0x00") {
      await (await channelFactory.createChannel(aliceAddress, bobAddress)).wait();
      log.info(`Successfully created a channel at ${channelAddress}`);
    } else {
      log.info(`Channel already exists at ${channelAddress}`);
    }
    return (hre.ethers as any).getContractAt(
      testMode ? "TestChannel" : "IVectorChannel",
      channelAddress,
      aliceAddress,
    );
  });
