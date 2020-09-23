import { getCreate2MultisigAddress, getRandomChannelSigner, ChannelSigner } from "@connext/vector-utils";
import { Contract, ContractFactory, constants, BigNumber } from "ethers";

import { ChannelMastercopy, ChannelFactory } from "../artifacts";
import { VectorOnchainService } from "../onchainService";

import { expect, getOnchainTxService, provider } from "./utils";

describe("ChannelFactory", () => {
  const deployer = provider.getWallets()[0];
  const initiator = new ChannelSigner(deployer.privateKey, provider);
  const counterparty = getRandomChannelSigner(provider);
  let channelFactory: Contract;
  let channelMastercopy: Contract;
  let onchainService: VectorOnchainService;
  let chainId: number;

  beforeEach(async () => {
    chainId = (await provider.getNetwork()).chainId;

    channelMastercopy = await new ContractFactory(ChannelMastercopy.abi, ChannelMastercopy.bytecode, deployer).deploy();
    await channelMastercopy.deployed();

    channelFactory = await new ContractFactory(ChannelFactory.abi, ChannelFactory.bytecode, deployer).deploy(
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
    const tx = await channelFactory.createChannel(counterparty.address);
    expect(tx.hash).to.be.a("string");
    await tx.wait();
    const channelAddress = await created;
    const computedAddr = await getCreate2MultisigAddress(
      initiator.publicIdentifier,
      counterparty.publicIdentifier,
      chainId,
      channelFactory.address,
      channelMastercopy.address,
      onchainService,
    );
    expect(channelAddress).to.be.a("string");
    expect(channelAddress).to.be.eq(computedAddr.getValue());
  });

  it("should create a channel with a deposit", async () => {
    // Use funded account for initiator
    const created = new Promise<string>((res) => {
      channelFactory.once(channelFactory.filters.ChannelCreation(), (data) => {
        res(data);
      });
    });
    const value = BigNumber.from("1000");
    const tx = await channelFactory
      .connect(deployer)
      .createChannelAndDepositA(counterparty.address, constants.AddressZero, value, { value });
    expect(tx.hash).to.be.a("string");
    await tx.wait();
    const channelAddress = await created;
    const computedAddr = await getCreate2MultisigAddress(
      initiator.publicIdentifier,
      counterparty.publicIdentifier,
      chainId,
      channelFactory.address,
      channelMastercopy.address,
      onchainService,
    );
    expect(channelAddress).to.be.a("string");
    expect(channelAddress).to.be.eq(computedAddr.getValue());

    const balance = await provider.getBalance(channelAddress as string);
    expect(balance).to.be.eq(value);

    const latestDeposit = await new Contract(channelAddress, ChannelMastercopy.abi, deployer).getLatestDeposit(
      constants.AddressZero,
    );
    expect(latestDeposit.nonce).to.be.eq(1);
    expect(latestDeposit.amount).to.be.eq(value);
  });
});
