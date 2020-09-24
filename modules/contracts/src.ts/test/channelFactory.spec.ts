import {
  getCreate2MultisigAddress,
  getPublicIdentifierFromPublicKey,
} from "@connext/vector-utils";
import { Contract, ContractFactory, BigNumber } from "ethers";

import { ChannelMastercopy, ChannelFactory } from "../artifacts";
import { VectorOnchainService } from "../onchainService";

import { addressZero, alice, bob, provider } from "./constants";
import { expect, getOnchainTxService } from "./utils";

describe("ChannelFactory", () => {
  const alicePubId = getPublicIdentifierFromPublicKey(alice.publicKey);
  const bobPubId = getPublicIdentifierFromPublicKey(bob.publicKey);
  let channelFactory: Contract;
  let channelMastercopy: Contract;
  let onchainService: VectorOnchainService;
  let chainId: number;

  beforeEach(async () => {
    chainId = (await provider.getNetwork()).chainId;

    channelMastercopy = await new ContractFactory(ChannelMastercopy.abi, ChannelMastercopy.bytecode, alice).deploy();
    await channelMastercopy.deployed();

    channelFactory = await new ContractFactory(ChannelFactory.abi, ChannelFactory.bytecode, alice).deploy(
      channelMastercopy.address,
    );
    await channelFactory.deployed();
    onchainService = await getOnchainTxService(provider);
  });

  it("should deploy", async () => {
    expect(channelFactory.address).to.be.a("string");
  });

  it("should create a channel", async () => {
    const created = new Promise((res) => {
      channelFactory.once(channelFactory.filters.ChannelCreation(), res);
    });
    const tx = await channelFactory.createChannel(alice.address, bob.address);
    expect(tx.hash).to.be.a("string");
    await tx.wait();
    const channelAddress = await created;
    const computedAddr = await getCreate2MultisigAddress(
      alicePubId,
      bobPubId,
      chainId,
      channelFactory.address,
      channelMastercopy.address,
      onchainService,
    );
    expect(channelAddress).to.be.a("string");
    expect(channelAddress).to.be.eq(computedAddr.getValue());
  });

  it("should create a channel with a deposit", async () => {
    // Use funded account for alice
    const created = new Promise<string>((res) => {
      channelFactory.once(channelFactory.filters.ChannelCreation(), (data) => {
        res(data);
      });
    });
    const value = BigNumber.from("1000");
    const tx = await channelFactory
      .connect(alice)
      .createChannelAndDeposit(
        alice.address,
        bob.address,
        addressZero,
        value,
        { value },
      );
    expect(tx.hash).to.be.a("string");
    await tx.wait();
    const channelAddress = await created;
    const computedAddr = await getCreate2MultisigAddress(
      alicePubId,
      bobPubId,
      chainId,
      channelFactory.address,
      channelMastercopy.address,
      onchainService,
    );
    expect(channelAddress).to.be.a("string");
    expect(channelAddress).to.be.eq(computedAddr.getValue());

    const balance = await provider.getBalance(channelAddress as string);
    expect(balance).to.be.eq(value);

    const code = await provider.getCode(channelAddress);
    expect(code).to.not.be.eq("0x");

    const latestDeposit = await (
      new Contract(channelAddress, ChannelMastercopy.abi, alice)
    ).getLatestDeposit(
      addressZero,
    );
    expect(latestDeposit.nonce).to.be.eq(1);
    expect(latestDeposit.amount).to.be.eq(value);
  });
});
