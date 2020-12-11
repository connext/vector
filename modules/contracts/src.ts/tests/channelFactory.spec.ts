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
import { deployments, ethers } from "hardhat";
import pino from "pino";

import { createChannel } from "../actions";
import { ChannelMastercopy } from "../artifacts";
import { VectorChainReader } from "../services";
import { getContract } from "../utils";

import { alice, bob, chainIdReq, provider } from "./constants";

describe("ChannelFactory", function () {
  this.timeout(120_000);
  const alicePubId = getPublicIdentifierFromPublicKey(alice.publicKey);
  const bobPubId = getPublicIdentifierFromPublicKey(bob.publicKey);
  let chainId: number;
  let chainReader: VectorChainReader;
  let channelFactory: Contract;
  let channelMastercopy: Contract;

  beforeEach(async () => {
    await deployments.fixture(); // Start w fresh deployments
    channelMastercopy = await getContract("ChannelMastercopy", alice);
    channelFactory = await getContract("ChannelFactory", alice);
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
    expect(await channelFactory.getProxyCreationCode()).to.equal(getMinimalProxyInitCode(channelMastercopy.address));
  });

  it("should create a channel and calculated addresses should match actual one", async () => {
    const channel = await createChannel(bob.address, alice);
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
    const value = BigNumber.from("1000");
    const tx = await (await (channelFactory.connect(alice).createChannelAndDepositAlice(
      alice.address,
      bob.address,
      AddressZero,
      value,
      { value },
    ))).wait();
    expect(tx.hash).to.be.a("string");
    const channelAddress = await channelFactory.getChannelAddress(alice.address, bob.address);
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

  it("should create a different channel with a different mastercopy address", async () => {
    const channel = await createChannel(bob.address, alice);
    const newChannelMastercopy = await (await (
      await ethers.getContractFactory("ChannelMastercopy", alice)
    ).deploy()).deployed();
    const newChannelFactory = await (await (
      await ethers.getContractFactory("ChannelFactory", alice)
    ).deploy(newChannelMastercopy.address, Zero)).deployed();
    const newChannelAddress = await newChannelFactory.getChannelAddress(alice.address, bob.address);
    await (await newChannelFactory.createChannel(alice.address, bob.address)).wait();
    expect(channel.address).to.not.eq(newChannelAddress);
  });
});
