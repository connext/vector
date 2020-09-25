import { FullChannelState, IChannelSigner, IVectorProtocol } from "@connext/vector-types";
import { BigNumber, constants } from "ethers";

import { depositInChannel, getSetupChannel, getTestLoggers } from "../utils";

const testName = "Deposit Integrations";
const { log } = getTestLoggers(testName);

describe(testName, () => {
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

  it.skip("should deposit tokens for alice", async () => {});
  it.skip("should deposit tokens for bob", async () => {});
  it.skip("should work after multiple deposits", async () => {});
  it.skip("should work if there have been no deposits onchain", async () => {});
  it.skip("should work if the channel is out of sync", async () => {});
  it.skip("should work concurrently", async () => {})
  it.skip("should work if channel is out of sync", async () => {});
});
