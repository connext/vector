import { expect, RestServerNodeService } from "@connext/vector-utils";
import { Wallet, utils, constants } from "ethers";
import pino from "pino";
import { INodeService } from "@connext/vector-types";

import { env, fundIfBelow, getRandomIndex } from "../utils";
import {
  chainId1,
  chainId2,
  deposit,
  requestCollateral,
  setup,
  transfer,
  wallet1,
  wallet2,
  withdraw,
} from "../utils/channel";

import { carolEvts, daveEvts } from "./eventSetup";

const logger = pino({ level: env.logLevel });
const testName = "Trio Happy";

describe(testName, () => {
  let carolService: INodeService;
  let daveService: INodeService;
  let rogerService: INodeService;

  beforeEach(async () => {
    const randomIndex = getRandomIndex();
    carolService = await RestServerNodeService.connect(
      env.carolUrl,
      logger.child({ testName, name: "Carol" }),
      carolEvts,
      randomIndex,
    );
    const min = utils.parseEther("0.1");

    daveService = await RestServerNodeService.connect(
      env.daveUrl,
      logger.child({ testName, name: "Dave" }),
      daveEvts,
      randomIndex,
    );

    rogerService = await RestServerNodeService.connect(
      env.rogerUrl,
      logger.child({ testName, name: "Roger" }),
      undefined,
      0,
    );
    // Default collateral is 0.1 ETH
    await fundIfBelow(rogerService.signerAddress, constants.AddressZero, min.mul(15), wallet1);
    if (wallet2) {
      await fundIfBelow(rogerService.signerAddress, constants.AddressZero, min.mul(15), wallet2);
    }
  });

  it("ETH: deposit, transfer C -> R -> D, withdraw", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.1");
    const transferAmt = utils.parseEther("0.05");
    const withdrawAmt = utils.parseEther("0.05");

    const carolRogerPostSetup = await setup(carolService, rogerService, chainId1);
    const daveRogerPostSetup = await setup(daveService, rogerService, chainId1);

    await deposit(carolService, rogerService, carolRogerPostSetup.channelAddress, assetId, depositAmt);
    const { transferQuote } = await transfer(
      carolService,
      daveService,
      carolRogerPostSetup.channelAddress,
      daveRogerPostSetup.channelAddress,
      assetId,
      transferAmt,
    );
    // withdraw to signing address
    await withdraw(carolService, carolRogerPostSetup.channelAddress, assetId, withdrawAmt, carolService.signerAddress);
    // withdraw to delegated recipient
    await withdraw(
      daveService,
      daveRogerPostSetup.channelAddress,
      assetId,
      withdrawAmt.sub(transferQuote.fee),
      Wallet.createRandom().address,
    );
  });

  it("ETH: deposit, requestCollateral + transfer C -> R -> D (x3)", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.2");
    const transferAmt = utils.parseEther("0.05");

    const carolRogerPostSetup = await setup(carolService, rogerService, chainId1);
    const daveRogerPostSetup = await setup(daveService, rogerService, chainId1);

    // carol deposits
    await deposit(carolService, rogerService, carolRogerPostSetup.channelAddress, assetId, depositAmt);

    for (const _ of Array(3).fill(0)) {
      // dave collateralizes
      await requestCollateral(daveService, rogerService, daveRogerPostSetup.channelAddress, assetId, transferAmt);

      // carol transfers
      await transfer(
        carolService,
        daveService,
        carolRogerPostSetup.channelAddress,
        daveRogerPostSetup.channelAddress,
        assetId,
        transferAmt,
      );
    }
  });

  it("cross-chain: deposit, transfer C -> R -> D, withdraw", async () => {
    if (!chainId2) {
      expect(true, "chainId2 not configured").to.be.true;
      return;
    }
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.1");
    const transferAmt = utils.parseEther("0.05");
    const withdrawAmt = utils.parseEther("0.05");

    const carolRogerPostSetup = await setup(carolService, rogerService, chainId1);
    const daveRogerPostSetup = await setup(daveService, rogerService, chainId2);

    await deposit(carolService, rogerService, carolRogerPostSetup.channelAddress, assetId, depositAmt);
    const { transferQuote } = await transfer(
      carolService,
      daveService,
      carolRogerPostSetup.channelAddress,
      daveRogerPostSetup.channelAddress,
      assetId,
      transferAmt,
      chainId2,
    );

    // withdraw to signing address
    await withdraw(carolService, carolRogerPostSetup.channelAddress, assetId, withdrawAmt, carolService.signerAddress);
    // withdraw to delegated recipient
    await withdraw(
      daveService,
      daveRogerPostSetup.channelAddress,
      assetId,
      withdrawAmt.sub(transferQuote.fee),
      Wallet.createRandom().address,
    );
  });
});
