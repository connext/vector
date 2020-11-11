import { Balance } from "@connext/vector-types";
import { expect } from "chai";
import { BigNumber, Contract, Wallet, constants } from "ethers";

import { getTestAddressBook, bob, getTestChannel } from "..";
import { AddressBook } from "../../addressBook";
import { provider } from "../constants";

const { AddressZero } = constants;

describe("CMCAccountant.sol", function() {
  this.timeout(120_000);
  let addressBook: AddressBook;
  let channel: Contract;

  beforeEach(async () => {
    addressBook = await getTestAddressBook();
    channel = await getTestChannel(addressBook);
    // Fund channel with eth
    await (await bob.sendTransaction({ to: channel.address, value: BigNumber.from("10000") })).wait();
  });

  it("should properly transfer balance", async () => {
    const value = BigNumber.from("1000");
    const balance: Balance = {
      to: [Wallet.createRandom().address, Wallet.createRandom().address],
      amount: [value.toString(), value.toString()],
    };
    const preTransfer = await Promise.all<BigNumber>(balance.to.map((a: string) => provider.getBalance(a)));
    const tx = await channel.accountantBalanceTransfer(AddressZero, balance);
    await tx.wait();
    await Promise.all(
      balance.to.map(async (a: string, idx: number) => {
        return expect(await provider.getBalance(a)).to.be.eq(preTransfer[idx].add(value));
      }),
    );
  });
});
