/* eslint-disable @typescript-eslint/no-empty-function */
import {
  getCreate2MultisigAddress,
  getMinimalProxyInitCode,
  getPublicIdentifierFromPublicKey,
  expect,
  getSignerAddressFromPublicIdentifier,
} from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { AddressZero, Zero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import pino from "pino";

import { createChannel, deployContracts } from "../actions";
import { AddressBook } from "../addressBook";
import { ChannelMastercopy } from "../artifacts";
import { VectorChainReader } from "../services";

import { alice, bob, chainIdReq, provider } from "./constants";
import { getTestAddressBook } from "./utils";

describe("ChannelFactory", function() {
  this.timeout(120_000);
  const alicePubId = getPublicIdentifierFromPublicKey(alice.publicKey);
  const bobPubId = getPublicIdentifierFromPublicKey(bob.publicKey);
  let addressBook: AddressBook;
  let chainId: number;
  let chainReader: VectorChainReader;
  let channelFactory: Contract;
  let channelMastercopy: Contract;

  beforeEach(async () => {
    addressBook = await getTestAddressBook();
    await deployContracts(alice, addressBook, [
      ["ChannelMastercopy", []],
      ["ChannelFactory", ["ChannelMastercopy", Zero]],
    ]);
    channelMastercopy = addressBook.getContract("ChannelMastercopy");
    channelFactory = addressBook.getContract("ChannelFactory");
    chainId = await chainIdReq;
    const network = await provider.getNetwork();
    const chainProviders = { [network.chainId]: provider };
    chainReader = new VectorChainReader(chainProviders, pino().child({ module: "VectorChainReader" }));
  });

  it("should deploy", async () => {
    expect(channelFactory.address).to.be.a("string");
  });

  it("should provide the mastercopy address", async () => {
    expect(await channelFactory.getMastercopy()).to.equal(channelMastercopy.address);
  });

  it("should provide the proxy bytecode", async () => {
    expect(await channelFactory.proxyCreationCode()).to.equal(getMinimalProxyInitCode(channelMastercopy.address));
  });

  it("should create a channel and calculated addresses should match actual one", async () => {
    const channel = await createChannel(bob.address, alice, addressBook);
    const computedAddr1 = await channelFactory.getChannelAddress(alice.address, bob.address);
    const computedAddr2 = await getCreate2MultisigAddress(
      alicePubId,
      bobPubId,
      chainId,
      channelFactory.address,
      chainReader,
    );
    expect(getSignerAddressFromPublicIdentifier(alicePubId)).to.be.eq(alice.address);
    expect(getSignerAddressFromPublicIdentifier(bobPubId)).to.be.eq(bob.address);
    expect(channel.address).to.be.eq(computedAddr1);
    expect(channel.address).to.be.eq(computedAddr2.getValue());
  });

  it("should create a channel with a deposit", async () => {
    // Use funded account for alice
    const created = new Promise<string>(res => {
      channelFactory.once(channelFactory.filters.ChannelCreation(), data => {
        res(data);
      });
    });
    const value = BigNumber.from("1000");
    const tx = await channelFactory
      .connect(alice)
      .createChannelAndDepositAlice(alice.address, bob.address, AddressZero, value, { value });
    expect(tx.hash).to.be.a("string");
    await tx.wait();
    const channelAddress = await created;
    const computedAddr = await getCreate2MultisigAddress(
      alicePubId,
      bobPubId,
      chainId,
      channelFactory.address,
      chainReader,
    );
    expect(channelAddress).to.be.a("string");
    expect(channelAddress).to.be.eq(computedAddr.getValue());

    const balance = await provider.getBalance(channelAddress as string);
    expect(balance).to.be.eq(value);

    const code = await provider.getCode(channelAddress);
    expect(code).to.not.be.eq("0x");

    const totalDepositsAlice = await new Contract(channelAddress, ChannelMastercopy.abi, alice).getTotalDepositsAlice(
      AddressZero,
    );
    expect(totalDepositsAlice).to.be.eq(value);
  });
});
