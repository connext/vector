import { INodeService } from "@connext/vector-types";
import { RestServerNodeService } from "@connext/vector-utils";
import { Wallet, utils, constants } from "ethers";
import pino from "pino";

import { env, getRandomIndex } from "../utils";
import { chainId, deposit, setup, transfer, wallet, withdraw } from "../utils/channel";

import { aliceEvts, bobEvts } from "./eventSetup";

const logger = pino({ level: env.logLevel });
const testName = "Duet Happy";

describe(testName, () => {
  let aliceService: INodeService;
  let bobService: INodeService;

  beforeEach(async () => {
    const randomIndex = getRandomIndex();
    aliceService = await RestServerNodeService.connect(
      env.aliceUrl,
      logger.child({ testName }),
      aliceEvts,
      randomIndex,
    );
    const aliceTx = await wallet.sendTransaction({ to: aliceService.signerAddress, value: utils.parseEther("0.5") });
    await aliceTx.wait();

    bobService = await RestServerNodeService.connect(env.bobUrl, logger.child({ testName }), bobEvts, randomIndex);

    const bobTx = await wallet.sendTransaction({ to: bobService.signerAddress, value: utils.parseEther("0.1") });
    await bobTx.wait();
  });

  it("ETH: A deposit, transfer A -> B, B deposit, transfer B -> A, withdraw", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.1");
    const transferAmt = utils.parseEther("0.005");
    const withdrawAmt = utils.parseEther("0.005");

    const aliceBobPostSetup = await setup(bobService, aliceService, chainId);

    await deposit(aliceService, bobService, aliceBobPostSetup.channelAddress, assetId, depositAmt);
    // alice to bob
    await transfer(
      aliceService,
      bobService,
      aliceBobPostSetup.channelAddress,
      aliceBobPostSetup.channelAddress,
      assetId,
      transferAmt,
    );
    await deposit(bobService, aliceService, aliceBobPostSetup.channelAddress, assetId, depositAmt);
    // bob to alice
    await transfer(
      bobService,
      aliceService,
      aliceBobPostSetup.channelAddress,
      aliceBobPostSetup.channelAddress,
      assetId,
      transferAmt,
    );
    // withdraw to signing address
    await withdraw(aliceService, aliceBobPostSetup.channelAddress, assetId, withdrawAmt, aliceService.signerAddress);
    // withdraw to delegated recipient
    await withdraw(bobService, aliceBobPostSetup.channelAddress, assetId, withdrawAmt, Wallet.createRandom().address);
  });
});
