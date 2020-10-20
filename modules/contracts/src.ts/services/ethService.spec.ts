import { expect, MemoryStoreService } from "@connext/vector-utils";
import { Contract } from "ethers";
import pino from "pino";

import { alice, chainIdReq, getTestChannel, provider } from "../tests";

import { EthereumChainService } from "./ethService";

describe("EthereumChainService", () => {
  let channel: Contract;
  let chainService: EthereumChainService;

  beforeEach(async () => {
    channel = await getTestChannel();
    chainService = new EthereumChainService(
      new MemoryStoreService(),
      { [await chainIdReq]: provider },
      alice.privateKey,
      pino(),
    );
  });

  it("should be created without error", async () => {
    expect(channel.address).to.be.ok;
    expect(chainService).to.be.ok;
  });
});
