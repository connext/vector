import { expect } from "@connext/vector-utils";
import { AddressZero, Zero } from "@ethersproject/constants";
import { Contract } from "ethers";
import pino from "pino";

import { createTestChannel, provider } from "../tests";

import { EthereumChainReader } from "./ethReader";

describe("EthereumChainReader", () => {
  let channel: Contract;
  let chainId: number;
  let chainReader: EthereumChainReader;

  beforeEach(async () => {
    channel = await createTestChannel();
    chainId = (await provider.getNetwork()).chainId;
    chainReader = new EthereumChainReader({ [chainId]: provider }, pino());
  });

  it("getChannelOnchainBalance", async () => {
    const balance = (await chainReader.getChannelOnchainBalance(
      channel.address,
      chainId,
      AddressZero,
    )).getValue();
    expect(balance).to.equal(Zero);
  });
});
