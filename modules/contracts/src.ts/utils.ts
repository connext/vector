import { Contract } from "@ethersproject/contracts";
import { ethers, run } from "hardhat";

import { alice, bob, defaultLogLevel, provider } from "./constants";

export const getContract = (ethers as any).getContract;

////////////////////////////////////////
// Wrap tasks in a format that's easier to use internally

export const registerTransfer = (
  transferName: string,
  signerAddress: string = alice.address,
  logLevel = defaultLogLevel,
): Promise<Contract> =>
  run("register-transfer", { transferName, signerAddress, logLevel });

export const createChannel = (
  aliceAddress: string = alice.address,
  bobAddress: string = bob.address,
  logLevel = defaultLogLevel,
  testMode = "yarp",
): Promise<Contract> =>
  run("create-channel", { aliceAddress, bobAddress, logLevel, testMode });

////////////////////////////////////////
// Other Utils

export const advanceBlocktime = async (seconds: number): Promise<void> => {
  const { timestamp: currTime } = await provider.getBlock("latest");
  await provider.send("evm_increaseTime", [seconds]);
  await provider.send("evm_mine", []);
  const { timestamp: finalTime } = await provider.getBlock("latest");
  const desired = currTime + seconds;
  if (finalTime < desired) {
    const diff = finalTime - desired;
    await provider.send("evm_increaseTime", [diff]);
  }
};
