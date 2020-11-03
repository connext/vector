/* eslint-disable @typescript-eslint/no-empty-function */
import { expect } from "@connext/vector-utils";
import { AddressZero, One } from "@ethersproject/constants";
import { BigNumber, Contract } from "ethers";
import { parseEther } from "ethers/lib/utils";

import { deployContracts } from "../../actions";
import { alice, bob } from "../constants";
import { getTestAddressBook, getTestChannel } from "../utils";

describe("CMCDeposit.sol", function() {
  this.timeout(120_000);
  const value = One;
  let channel: Contract;
  let failingToken: Contract;

  beforeEach(async () => {
    const addressBook = await getTestAddressBook();
    channel = await getTestChannel(addressBook);

    await deployContracts(alice, addressBook, [["FailingToken", []]]);
    failingToken = addressBook.getContract("FailingToken");
    const tx = await failingToken.mint(alice.address, parseEther("0.001"));
    await tx.wait();
  });

  it("should only increase totalDepositsBob after receiving a direct deposit", async () => {
    const aliceDeposits = await channel.getTotalDepositsAlice(AddressZero);
    const bobDeposits = await channel.getTotalDepositsBob(AddressZero);
    const tx = await bob.sendTransaction({ to: channel.address, value });
    await tx.wait();
    expect(await channel.getTotalDepositsAlice(AddressZero)).to.equal(aliceDeposits);
    expect(await channel.getTotalDepositsBob(AddressZero)).to.equal(bobDeposits.add(value));
  });

  it("should only increase totalDepositsAlice after recieving a deposit via method call", async () => {
    const aliceDeposits = await channel.getTotalDepositsAlice(AddressZero);
    const bobDeposits = await channel.getTotalDepositsBob(AddressZero);
    const tx = await channel.connect(alice).depositAlice(AddressZero, value, { value });
    await tx.wait();
    expect(await channel.getTotalDepositsAlice(AddressZero)).to.equal(aliceDeposits.add(value));
    expect(await channel.getTotalDepositsBob(AddressZero)).to.equal(bobDeposits);
  });

  it("depositAlice should fail if the amount doesnt match the value", async () => {
    await expect(channel.depositAlice(AddressZero, value, { value: BigNumber.from(0) })).revertedWith(
      "CMCDeposit: msg.value does not match the provided amount",
    );
    expect(await channel.getTotalDepositsAlice(AddressZero)).to.be.eq(0);
  });

  it("should fail if the token transfer fails", async () => {
    expect(await failingToken.balanceOf(alice.address)).to.be.gt(value);
    await expect(channel.depositAlice(failingToken.address, value)).revertedWith("FAIL: Failing token");
    expect(await channel.getTotalDepositsAlice(failingToken.address)).to.be.eq(0);
  });
});
