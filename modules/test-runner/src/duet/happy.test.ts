import { INodeService } from "@connext/vector-types";
import { RestServerNodeService } from "@connext/vector-utils";
import { Wallet, utils, constants } from "ethers";
import pino from "pino";

import { env, getRandomIndex } from "../utils";
import { chainId, deposit, setup, transfer, wallet, withdraw } from "../utils/channel";

const logger = pino({ level: env.logLevel });
const testName = "Duet Happy";

describe(testName, () => {
  let aliceService: INodeService;
  let alice: string;

  let bobService: INodeService;
  let bob: string;

  before(async () => {
    const randomIndex = getRandomIndex();
    aliceService = await RestServerNodeService.connect(
      env.aliceUrl,
      logger.child({ testName }),
      undefined,
      randomIndex,
    );
    alice = aliceService.signerAddress;
    const aliceTx = await wallet.sendTransaction({ to: alice, value: utils.parseEther("0.1") });
    await aliceTx.wait();

    bobService = await RestServerNodeService.connect(env.bobUrl, logger.child({ testName }), undefined, randomIndex);
    bob = bobService.signerAddress;

    const bobTx = await wallet.sendTransaction({ to: bob, value: utils.parseEther("0.1") });
    await bobTx.wait();
  });

  it("ETH: deposit, transfer C -> R -> D, withdraw", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.1");
    const transferAmt = utils.parseEther("0.005");
    const withdrawAmt = utils.parseEther("0.005");

    const aliceBobPostSetup = await setup(aliceService, bobService, chainId);

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
