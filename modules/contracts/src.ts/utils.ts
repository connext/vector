import { Contract } from "@ethersproject/contracts";
import { ethers, run } from "hardhat";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";

import { TestChannel, TestToken } from "./artifacts";
import { alice, bob, provider } from "./constants";

export const getContract = (ethers as any).getContract;

////////////////////////////////////////
// Wrap tasks in a format that's easier to use internally

export const registerTransfer = (
  transferName: string,
  signerAddress: string = alice.address,
  logLevel = "silent",
): Promise<Contract> =>
  run("register-transfer", { transferName, signerAddress, logLevel });

export const createChannel = (
  aliceAddress: string = alice.address,
  bobAddress: string = bob.address,
  logLevel = "silent",
  testMode = "",
): Promise<Contract> =>
  run("create-channel", { aliceAddress, bobAddress, logLevel, testMode });

////////////////////////////////////////
// Other Utils

export const getUnsetupChannel = async (): Promise<Contract> => {
  const testFactory = await getContract("TestChannelFactory", alice);
  const channelAddress = await testFactory.getChannelAddress(alice.address, bob.address);
  await (await testFactory.createChannelWithoutSetup(alice.address, bob.address)).wait();
  return new Contract(channelAddress, TestChannel.abi, alice);
};

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

export const getOnchainBalance = async (assetId: string, address: string): Promise<BigNumber> => {
  return assetId === AddressZero
    ? provider.getBalance(address)
    : new Contract(assetId, TestToken.abi, provider).balanceOf(address);
};

export const fundAddress = async (address: string, assetId: string, minimumAmt: BigNumber): Promise<void> => {
  const balance = await getOnchainBalance(assetId, address);
  if (balance.gte(minimumAmt)) {
    return;
  }
  const funderBal = await getOnchainBalance(assetId, alice.address);
  if (funderBal.lt(minimumAmt)) {
    throw new Error(
      `${
        alice.address
      } has insufficient funds to gift to ${address} (requested: ${minimumAmt.toString()}, balance: ${funderBal.toString()})`,
    );
  }
  const tx =
    assetId === AddressZero
      ? await alice.sendTransaction({ to: address, value: minimumAmt })
      : await new Contract(assetId, TestToken.abi, alice).transfer(address, minimumAmt);
  await tx.wait();
};
