import { expect, RestServerNodeService } from "@connext/vector-utils";
import { utils, constants } from "ethers";
import { FullChannelState, FullTransferState, INodeService } from "@connext/vector-types";
import axios from "axios";

import { env, fundIfBelow, getRandomIndex, getTestLoggers } from "../utils";
import { chainId1, deposit, setup, transfer, wallet1 } from "../utils/channel";

import { aliceEvts, bobEvts } from "./eventSetup";

const testName = "Duet Restore";

const { log } = getTestLoggers(testName);

describe.only(testName, () => {
  let aliceService: INodeService;
  let bobService: INodeService;
  let channelAddress: string;

  const onchainMin = utils.parseEther("0.1");
  const depositVal = onchainMin.div(100);
  const transferVal = depositVal.div(100);

  beforeEach(async () => {
    // Prep alice-bob nodes onchain
    const randomIndex = getRandomIndex();

    aliceService = await RestServerNodeService.connect(env.aliceUrl, log.child({ testName }), aliceEvts, randomIndex);
    await fundIfBelow(aliceService.signerAddress, constants.AddressZero, onchainMin, wallet1);

    bobService = await RestServerNodeService.connect(env.bobUrl, log.child({ testName }), bobEvts, randomIndex);
    await fundIfBelow(bobService.signerAddress, constants.AddressZero, onchainMin, wallet1);

    // Setup channel
    const postSetup = await setup(bobService, aliceService, chainId1);
    channelAddress = postSetup.channelAddress;

    // Alice deposit into channel
    await deposit(aliceService, bobService, postSetup.channelAddress, constants.AddressZero, depositVal);

    // Bob deposit into channel
    await deposit(bobService, aliceService, postSetup.channelAddress, constants.AddressZero, depositVal);

    // Create some transfers
    // NOTE: doing `await Promise.all` will cause errors with balance assertions
    // in helper
    await transfer(
      aliceService,
      bobService,
      postSetup.channelAddress,
      postSetup.channelAddress,
      constants.AddressZero,
      transferVal,
      postSetup.networkContext.chainId,
    );
    await transfer(
      aliceService,
      bobService,
      postSetup.channelAddress,
      postSetup.channelAddress,
      constants.AddressZero,
      transferVal,
      postSetup.networkContext.chainId,
    );
  });

  describe("alice restores from bob", () => {
    let preRestoreChannel: FullChannelState;
    let preRestoreTransfers: FullTransferState[];

    beforeEach(async () => {
      // Set preRestore channe
      const preRestoreReq = await aliceService.getStateChannel({
        channelAddress,
        publicIdentifier: aliceService.publicIdentifier,
      });
      preRestoreChannel = preRestoreReq.getValue() as FullChannelState;
      const preRestoreTransfersReq = await aliceService.getActiveTransfers({
        channelAddress,
      });
      preRestoreTransfers = preRestoreTransfersReq.getValue().sort((a, b) => a.channelNonce - b.channelNonce);
      // Clear alice store
      console.log("**** trying to remove alice channel");
      const aliceClear = (await axios.post(`${env.aliceUrl}/clear-store`, { adminToken: env.adminToken })).data;
      console.log("**** sent request");
      const channel = await aliceService.getStateChannel({
        channelAddress,
        publicIdentifier: aliceService.publicIdentifier,
      });
      expect(channel.isError).to.be.true;
      expect(channel.getError()!.message).to.be.eq("Channel not found");
    });

    it("should work", async () => {
      const restore = await aliceService.restoreState({
        counterpartyIdentifier: bobService.publicIdentifier,
        chainId: chainId1,
      });
      expect(restore.getValue()).to.be.deep.eq({ channelAddress });

      const channelRes = await aliceService.getStateChannel({ channelAddress });
      expect(channelRes.getValue()).to.be.deep.eq(preRestoreChannel);
      const transfers = await aliceService.getActiveTransfers({
        channelAddress,
      });
      expect(transfers.getValue().sort((a, b) => a.channelNonce - b.channelNonce)).to.be.deep.eq(preRestoreTransfers);
    });
  });

  describe("bob restores from alice", () => {
    let preRestoreChannel: FullChannelState;
    let preRestoreTransfers: FullTransferState[];

    beforeEach(async () => {
      // Set preRestore channe
      const preRestoreReq = await bobService.getStateChannel({
        channelAddress,
        publicIdentifier: aliceService.publicIdentifier,
      });
      preRestoreChannel = preRestoreReq.getValue() as FullChannelState;
      const preRestoreTransfersReq = await aliceService.getActiveTransfers({
        channelAddress,
      });
      preRestoreTransfers = preRestoreTransfersReq.getValue().sort((a, b) => a.channelNonce - b.channelNonce);
      // Clear alice store
      const bobClear = (await axios.post(`${env.bobUrl}/clear-store`, { adminToken: env.adminToken })).data;
      const channel = await bobService.getStateChannel({
        channelAddress,
        publicIdentifier: bobService.publicIdentifier,
      });
      expect(channel.isError).to.be.true;
      expect(channel.getError()!.message).to.be.eq("Channel not found");
    });

    it("should work", async () => {
      const restore = await bobService.restoreState({
        counterpartyIdentifier: aliceService.publicIdentifier,
        chainId: chainId1,
      });
      expect(restore.getValue()).to.be.deep.eq({ channelAddress });

      const channelRes = await bobService.getStateChannel({ channelAddress });
      expect(channelRes.getValue()).to.be.deep.eq(preRestoreChannel);
      const transfers = await aliceService.getActiveTransfers({
        channelAddress,
      });
      expect(transfers.getValue().sort((a, b) => a.channelNonce - b.channelNonce)).to.be.deep.eq(preRestoreTransfers);
    });
  });
});
