import {
  FullChannelState,
  IChannelSigner,
  IVectorProtocol,
} from "@connext/vector-types";
import { BigNumber, constants } from "ethers";

import { getTestLoggers } from "../utils";
import { depositInChannel, getSetupChannel } from "../utils/channel";

const testName = "Deposit Integrations";
const { log } = getTestLoggers(testName);

describe.only(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;
  let preDepositChannel: FullChannelState;

  let aliceSigner: IChannelSigner;
  let bobSigner: IChannelSigner;

  beforeEach(async () => {
    const setup = await getSetupChannel(testName);
    alice = setup.alice;
    bob = setup.bob;
    preDepositChannel = setup.channel;
    aliceSigner = setup.aliceSigner;
    bobSigner = setup.bobSigner;

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });
  });

  it("should deposit eth for Alice (depositA)", async () => {
    const depositAmount = BigNumber.from("1000");
    const assetId = constants.AddressZero;

    await depositInChannel(preDepositChannel.channelAddress, alice, aliceSigner, bob, assetId, depositAmount);
  });

  it("should deposit eth for Bob (multisig deposit)", async () => {
    const depositAmount = BigNumber.from("1000");
    const assetId = constants.AddressZero;

    await depositInChannel(preDepositChannel.channelAddress, bob, bobSigner, alice, assetId, depositAmount);
  });
});
