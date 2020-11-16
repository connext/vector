import { FullChannelState } from "@connext/vector-types";
import {
  expect,
  ChannelSigner,
  MemoryStoreService,
  createTestChannelStateWithSigners,
} from "@connext/vector-utils";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import pino from "pino";

import { alice, bob, chainIdReq, getTestChannel, provider } from "../tests";

import { EthereumChainService } from "./ethService";

describe("EthereumChainService", function() {
  this.timeout(120_000);
  const aliceSigner = new ChannelSigner(alice.privateKey);
  const bobSigner = new ChannelSigner(bob.privateKey);
  let channel: Contract;
  let chainService: EthereumChainService;
  let channelState: FullChannelState<any>;

  before(async () => {
    channel = await getTestChannel();
    chainService = new EthereumChainService(
      new MemoryStoreService(),
      { [await chainIdReq]: provider },
      alice.privateKey,
      pino(),
    );
    channelState = createTestChannelStateWithSigners([aliceSigner, bobSigner], "create", {
      channelAddress: channel.address,
      assetIds: [AddressZero],
      balances: [{ to: [alice.address, bob.address], amount: ["1", "2"] }],
      processedDepositsA: ["0"],
      processedDepositsB: ["0"],
      timeout: "1",
      nonce: 3,
      merkleRoot: HashZero,
    });
  });

  it("should be created without error", async () => {
    expect(channel.address).to.be.ok;
    expect(chainService).to.be.ok;
  });

  it("should run sendDepositTx without error", async () => {
    const res = await chainService.sendDepositTx(
      channelState,
      alice.address,
      "10",
      AddressZero,
    );
    expect(res.isError).to.be.false;
    expect(res.getValue()).to.be.ok;
  });

  it("should run sendWithdrawTx without error", async () => {
    const res = await chainService.sendWithdrawTx(
      channelState,
      {
        to: bob.address,
        data: "0x",
        value: "0x01",
      },
    );
    expect(res.isError).to.be.false;
    expect(res.getValue()).to.be.ok;
  });

  it.skip("should run sendDeployChannelTx without error", async () => {
    const res = await chainService.sendDeployChannelTx(
      channelState,
      {
        amount: "0x01",
        assetId: AddressZero,
      },
    );
    expect(res.isError).to.be.false;
    expect(res.getValue()).to.be.ok;
  });

  it.skip("should run sendDisputeChannelTx without error", async () => {
    const res = await chainService.sendDisputeChannelTx(channelState);
    expect(res.isError).to.be.false;
    expect(res.getValue()).to.be.ok;
  });

  /*
  it.skip("should run sendDefundChannelTx without error", async () => {
    const res = await chainService.sendDefundChannelTx(channelState);
    expect(res.isError).to.be.false;
    expect(res.getValue()).to.be.ok;
  });

  it.skip("should run sendDisputeTransferTx without error", async () => {
    const res = await chainService.sendDisputeTransferTx(1, []);
    expect(res.isError).to.be.false;
    expect(res.getValue()).to.be.ok;
  });

  it.skip("should run sendDefundTransferTx without error", async () => {
    const res = await chainService.sendDefundTransferTx(transferState);
    expect(res.isError).to.be.false;
    expect(res.getValue()).to.be.ok;
  });
  */

});
