import { delay, expect, getRandomBytes32, RestServerNodeService } from "@connext/vector-utils";
import { Wallet, utils, constants } from "ethers";
import pino from "pino";
import { EngineEvents, INodeService, TransferNames } from "@connext/vector-types";
import { waitForTransaction } from "@connext/vector-contracts";

import { env, fundIfBelow, getOnchainBalance, getRandomIndex } from "../utils";
import {
  advanceBlocktime,
  chainId1,
  chainId2,
  defundChannel,
  deposit,
  disputeChannel,
  exitAssets,
  provider1,
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

  it("should properly forward all transfers to the same recipient (i.e. no creation race conditions on the router)", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("1");
    const transferAmt = utils.parseEther("0.1");

    const carolRogerPostSetup = await setup(carolService, rogerService, chainId1);
    await setup(daveService, rogerService, chainId1);
    await deposit(carolService, rogerService, carolRogerPostSetup.channelAddress, assetId, depositAmt);
    const routedSuccessfully: string[] = [];
    daveService.on(
      EngineEvents.CONDITIONAL_TRANSFER_CREATED,
      (data) => {
        routedSuccessfully.push(data.transfer.meta.routingId);
      },
      undefined,
      daveService.publicIdentifier,
    );
    const cancelled: string[] = [];
    carolService.on(
      EngineEvents.CONDITIONAL_TRANSFER_RESOLVED,
      (data) => {
        cancelled.push(data.transfer.meta.routingId);
      },
      undefined,
      carolService.publicIdentifier,
    );

    const routingIds: string[] = [];
    for (const _ of Array(10).fill(0)) {
      const preImage = getRandomBytes32();
      const lockHash = utils.soliditySha256(["bytes32"], [preImage]);
      const routingId = getRandomBytes32();
      // have carol create transfer
      const transfer = await carolService.conditionalTransfer({
        publicIdentifier: carolService.publicIdentifier,
        amount: transferAmt.toString(),
        assetId,
        channelAddress: carolRogerPostSetup.channelAddress,
        type: TransferNames.HashlockTransfer,
        details: {
          lockHash,
          expiry: "0",
        },
        meta: {
          routingId,
        },
        recipient: daveService.publicIdentifier,
        recipientChainId: chainId1,
      });
      if (transfer.isError) {
        throw transfer.getError();
      }
      routingIds.push(routingId);
    }
    await delay(15_000);
    expect(routingIds.sort()).to.be.deep.eq(routedSuccessfully.sort());
    expect(cancelled.length).to.be.eq(0);
  });

  it("ETH: should be able to dispute a channel", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.1");
    const carolRogerPostSetup = await setup(carolService, rogerService, chainId1);

    // Carol deposits
    const carolRogerPostDeposit = await deposit(
      carolService,
      rogerService,
      carolRogerPostSetup.channelAddress,
      assetId,
      depositAmt,
    );
    expect(carolRogerPostDeposit.balances[0].to[1]).to.be.eq(carolService.signerAddress);

    await disputeChannel(rogerService, carolService, carolRogerPostDeposit.channelAddress, provider1);

    await advanceBlocktime(parseInt(carolRogerPostSetup.timeout) + 5_000);

    await defundChannel(rogerService, carolRogerPostDeposit.channelAddress, provider1);

    // exit carol (only one with balance)
    await exitAssets(
      rogerService,
      carolRogerPostDeposit.channelAddress,
      provider1,
      [assetId],
      carolService.signerAddress,
      carolService.signerAddress,
    );
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
      withdrawAmt.sub(transferQuote.fee).div(2),
      Wallet.createRandom().address,
    );
    // bob withdraws
    await withdraw(
      daveService,
      daveRogerPostSetup.channelAddress,
      assetId,
      withdrawAmt.sub(transferQuote.fee).div(2),
      Wallet.createRandom().address,
      true,
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
