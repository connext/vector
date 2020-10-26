import { Balance } from "@connext/vector-types";
import { AddressZero } from "@ethersproject/constants";
import { expect } from "chai";
import { BigNumber, Contract, Wallet } from "ethers";
import { parseEther } from "ethers/lib/utils";

import { getTestAddressBook, bob, getTestChannel } from "..";
import { AddressBook } from "../../addressBook";
import { provider } from "../constants";

describe("CMCAccountant.sol", () => {
  let addressBook: AddressBook;
  let channel: Contract;

  beforeEach(async () => {
    addressBook = await getTestAddressBook();
    channel = await getTestChannel(addressBook);

    // Fund channel with eth
    const eth = await bob.sendTransaction({ to: channel.address, value: parseEther("0.001") });
    await eth.wait();
  });

  it("should properly transfer balance", async () => {
    const value = parseEther("0.0001");
    const balance: Balance = {
      to: [Wallet.createRandom().address, Wallet.createRandom().address],
      amount: [value.toString(), value.toString()],
    };
    const preTransfer = await Promise.all<BigNumber>(balance.to.map((a: string) => provider.getBalance(a)));
    await channel.accountantBalanceTransfer(AddressZero, balance);
    await Promise.all(
      balance.to.map(async (a: string, idx: number) => {
        return expect(await provider.getBalance(a)).to.be.eq(preTransfer[idx].add(value));
      }),
    );
  });
});
