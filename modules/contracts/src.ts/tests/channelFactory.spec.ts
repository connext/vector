import { getCreate2MultisigAddress, getPublicIdentifierFromPublicKey, expect } from "@connext/vector-utils";
import { AddressZero } from "@ethersproject/constants";
import { Contract, BigNumber } from "ethers";
import pino from "pino";

import { ChannelMastercopy, Proxy } from "../artifacts";
import { VectorChainReader } from "../services";

import { alice, bob, provider } from "./constants";
import { createTestChannel, createTestChannelFactory, createTestChannelMastercopy } from "./utils";

describe("ChannelFactory", () => {
  const alicePubId = getPublicIdentifierFromPublicKey(alice.publicKey);
  const bobPubId = getPublicIdentifierFromPublicKey(bob.publicKey);
  let channelFactory: Contract;
  let channelMastercopy: Contract;
  let chainReader: VectorChainReader;
  let chainId: number;

  beforeEach(async () => {
    chainId = (await provider.getNetwork()).chainId;

    channelMastercopy = await createTestChannelMastercopy();
    channelFactory = await createTestChannelFactory(channelMastercopy);

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
    expect(await channelFactory.proxyCreationCode()).to.equal(Proxy.bytecode);
  });

  it.skip("should return the correctly calculated channel address", async () => {});

  it("should create a channel", async () => {
    const channel = await createTestChannel(channelFactory);
    const computedAddr = await getCreate2MultisigAddress(
      alicePubId,
      bobPubId,
      chainId,
      channelFactory.address,
      chainReader,
    );
    expect(channel.address).to.be.eq(computedAddr.getValue());
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
      .createChannelAndDepositAlice(alice.address, bob.address, chainId, AddressZero, value, { value });
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
