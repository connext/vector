import { expect, MemoryStoreService } from "@connext/vector-utils";
import { Contract } from "@ethersproject/contracts";
import pino from "pino";

import { alice, chainIdReq, getTestChannel, provider } from "../tests";

import { EthereumChainService } from "./ethService";

describe("EthereumChainService", function() {
  this.timeout(120_000);
  let channel: Contract;
  let chainService: EthereumChainService;

  before(async () => {
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
