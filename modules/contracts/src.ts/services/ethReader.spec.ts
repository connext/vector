import { expect } from "@connext/vector-utils";
import { AddressZero, Zero } from "@ethersproject/constants";
import { Contract } from "ethers";
import pino from "pino";

import { alice, bob, createTestChannel, createTestChannelFactory, provider } from "../tests";

import { EthereumChainReader } from "./ethReader";

// TODO: check whether result is valid, not just whether it exists
describe("EthereumChainReader", () => {
  const assetId = AddressZero;
  const transfer = {} as any; // TODO
  let chainId: number;
  let chainReader: EthereumChainReader;
  let channel: Contract;
  let factory: Contract;

  beforeEach(async () => {
    factory = await createTestChannelFactory();
    channel = await createTestChannel();
    chainId = (await provider.getNetwork()).chainId;
    chainReader = new EthereumChainReader({ [chainId]: provider }, pino());
  });

  it("getChannelOnchainBalance", async () => {
    const balance = (await chainReader.getChannelOnchainBalance(
      channel.address,
      chainId,
      assetId,
    )).getValue();
    expect(balance).to.equal(Zero);
  });


  it("getTotalDepositedA", async () => {
    const res = (await chainReader.getTotalDepositedA(
      channel.address,
      chainId,
      assetId,
    )).getValue();
    expect(res).to.be.ok;
  });

  it("getTotalDepositedB", async () => {
    const res = (await chainReader.getTotalDepositedB(
      channel.address,
      chainId,
      assetId,
    )).getValue();
    expect(res).to.be.ok;
  });

  it("getChannelFactoryBytecode", async () => {
    const res = (await chainReader.getChannelFactoryBytecode(
      factory.address,
      chainId,
    )).getValue();
    expect(res).to.be.ok;
  });

  it("getChannelAddress", async () => {
    const res = (await chainReader.getChannelAddress(
      alice.address,
      bob.address,
      factory.address,
      chainId,
    )).getValue();
    expect(res).to.be.ok;
  });

  it.skip("create", async () => {
    const res = (await chainReader.create(
      transfer,
      chainId,
      // bytecode?: string,
    )).getValue();
    expect(res).to.be.ok;
  });

  it.skip("resolve", async () => {
    const res = (await chainReader.resolve(
      transfer,
      chainId,
      // bytecode?: string,
    )).getValue();
    expect(res).to.be.ok;
  });

  it("getCode", async () => {
    const res = (await chainReader.getCode(
      channel.address,
      chainId,
    )).getValue();
    expect(res).to.be.ok;
  });
});
