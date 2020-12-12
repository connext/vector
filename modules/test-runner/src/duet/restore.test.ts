import { expect, RestServerNodeService } from "@connext/vector-utils";
import { utils, constants } from "ethers";
import { INodeService } from "@connext/vector-types";
import axios from "axios";

import { env, fundIfBelow, getRandomIndex, getTestLoggers } from "../utils";
import { chainId1, deposit, setup, wallet1 } from "../utils/channel";

import { aliceEvts, bobEvts } from "./eventSetup";

const testName = "Duet Restore";

const { log } = getTestLoggers(testName);

describe(testName, () => {
  let aliceService: INodeService;
  let bobService: INodeService;
  let channelAddress: string;

  const onchainMin = utils.parseEther("0.1");
  const depositVal = onchainMin.div(10000);
  // const transferVal = depositVal.div(10000);

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
    const postAliceDeposit = await deposit(
      aliceService,
      bobService,
      postSetup.channelAddress,
      constants.AddressZero,
      depositVal,
    );

    // Bob deposit into channel
    const postBobDeposit = await deposit(
      bobService,
      aliceService,
      postSetup.channelAddress,
      constants.AddressZero,
      depositVal,
    );
  });

  describe("alice restores from bob", () => {
    let preRestore;

    beforeEach(async () => {
      const getChannelParams = { channelAddress, publicIdentifier: aliceService.publicIdentifier };
      // Set preRestore channe
      const preRestoreReq = await aliceService.getStateChannel(getChannelParams);
      preRestore = preRestoreReq.getValue();
      // Clear alice store
      const aliceClear = (await axios.post(`${env.aliceUrl}/clear-store`, { adminToken: env.adminToken })).data;
      await expect(
        aliceService.getStateChannel({ channelAddress, publicIdentifier: aliceService.publicIdentifier }),
      ).rejectedWith("404");
    });

    it("should work", async () => {
      // const restore = await aliceService.restoreChannel({
      //   counterpartyIdentifier: bobService.publicIdentifier,
      //   chainId: chainId1,
      // });
      // expect(restore).to.be.deep.eq(preRestore);
    });
  });

  describe("bob restores from alice", () => {
    it("should work", async () => {});
  });
});
