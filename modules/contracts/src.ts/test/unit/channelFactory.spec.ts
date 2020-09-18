import { getCreate2MultisigAddress, getRandomChannelSigner, ChannelSigner } from "@connext/vector-utils";
import { Contract, ContractFactory, Wallet, constants, BigNumber } from "ethers";

import { Adjudicator, VectorChannel, ChannelFactory } from "../../artifacts";
import { expect, provider } from "../utils";

describe("ChannelFactory", () => {
  let deployer: Wallet;
  let channelFactory: Contract;
  let channelMastercopy: Contract;

  beforeEach(async () => {
    deployer = (await provider.getWallets())[0];
    const adjudicator = await new ContractFactory(Adjudicator.abi, Adjudicator.bytecode, deployer).deploy();
    await adjudicator.deployed();

    channelMastercopy = await new ContractFactory(VectorChannel.abi, VectorChannel.bytecode, deployer).deploy();
    await channelMastercopy.deployed();

    channelFactory = await new ContractFactory(ChannelFactory.abi, ChannelFactory.bytecode, deployer).deploy(
      channelMastercopy.address,
      adjudicator.address,
    );
    await channelFactory.deployed();
  });

  it("should deploy", async () => {
    expect(channelFactory.address).to.be.a("string");
  });

  it("should create a channel", async () => {
    const initiator = getRandomChannelSigner();
    const responder = getRandomChannelSigner();
    const created = new Promise((res) => {
      channelFactory.once(channelFactory.filters.ChannelCreation(), (data) => {
        res(data);
      });
    });
    const tx = await channelFactory.createChannel(initiator.address, responder.address);
    expect(tx.hash).to.be.a("string");
    await tx.wait();
    const channelAddress = await created;
    const computedAddr = await getCreate2MultisigAddress(
      initiator.publicIdentifier,
      responder.publicIdentifier,
      channelFactory.address,
      ChannelFactory.abi,
      channelMastercopy.address,
      provider,
    );
    expect(channelAddress).to.be.a("string");
    expect(channelAddress).to.be.eq(computedAddr);
  });

  it("should create a channel with a deposit", async () => {
    // Use funded account for initiator
    const initiator = new ChannelSigner(deployer.privateKey, provider);
    const responder = getRandomChannelSigner();
    const created = new Promise<string>((res) => {
      channelFactory.once(channelFactory.filters.ChannelCreation(), (data) => {
        res(data);
      });
    });
    const value = BigNumber.from("1000");
    const tx = await channelFactory
      .connect(deployer)
      .createChannelAndDepositA(initiator.address, responder.address, constants.AddressZero, value, { value });
    expect(tx.hash).to.be.a("string");
    await tx.wait();
    const channelAddress = await created;
    const computedAddr = await getCreate2MultisigAddress(
      initiator.publicIdentifier,
      responder.publicIdentifier,
      channelFactory.address,
      ChannelFactory.abi,
      channelMastercopy.address,
      provider,
    );
    expect(channelAddress).to.be.a("string");
    expect(channelAddress).to.be.eq(computedAddr);

    const balance = await provider.getBalance(channelAddress as string);
    expect(balance).to.be.eq(value);

    const latestDeposit = await new Contract(channelAddress, VectorChannel.abi, deployer).latestDepositByAssetId(constants.AddressZero);
    expect(latestDeposit.nonce).to.be.eq(1);
    expect(latestDeposit.amount).to.be.eq(value);
  });
});
