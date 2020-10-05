import { getCreate2MultisigAddress, getPublicIdentifierFromPublicKey, expect } from "@connext/vector-utils";
import { AddressZero } from "@ethersproject/constants";
import { Contract, ContractFactory, BigNumber } from "ethers";
import pino from "pino";

import { ChannelMastercopy, ChannelFactory } from "../artifacts";
import { VectorChainReader } from "../services";

import { alice, bob, provider } from "./constants";

describe("ChannelFactory", () => {
  const alicePubId = getPublicIdentifierFromPublicKey(alice.publicKey);
  const bobPubId = getPublicIdentifierFromPublicKey(bob.publicKey);
  let channelFactory: Contract;
  let channelMastercopy: Contract;
  let chainReader: VectorChainReader;
  let chainId: number;

  beforeEach(async () => {
    chainId = (await provider.getNetwork()).chainId;

    channelMastercopy = await new ContractFactory(ChannelMastercopy.abi, ChannelMastercopy.bytecode, alice).deploy();
    await channelMastercopy.deployed();

    channelFactory = await new ContractFactory(ChannelFactory.abi, ChannelFactory.bytecode, alice).deploy(
      channelMastercopy.address,
    );
    await channelFactory.deployed();

    const network = await provider.getNetwork();
    const chainProviders = { [network.chainId]: provider };
    chainReader = new VectorChainReader(
      chainProviders,
      pino().child({ module: "VectorChainReader" }),
    );

  });

  it("should deploy", async () => {
    expect(channelFactory.address).to.be.a("string");
  });

  it("should create a channel", async () => {
    const created = new Promise(res => {
      channelFactory.once(channelFactory.filters.ChannelCreation(), res);
    });
    const tx = await channelFactory.createChannel(alice.address, bob.address, chainId);
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
      .createChannelAndDepositA(alice.address, bob.address, chainId, AddressZero, value, { value });
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

    const totalDepositedA = await new Contract(channelAddress, ChannelMastercopy.abi, alice).totalDepositedA(
      AddressZero,
    );
    expect(totalDepositedA).to.be.eq(value);
  });
});
