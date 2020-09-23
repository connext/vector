import { FullChannelState, IVectorProtocol } from "@connext/vector-types";
import { constants } from "ethers";

import { expect, getTestLoggers } from "../utils";
import { createTransfer, getFundedChannel } from "../utils/channel";

const testName = "Create Integrations";
const { log } = getTestLoggers(testName);
describe(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;

  let preCreateChannel: FullChannelState;

  beforeEach(async () => {
    const setup = await getFundedChannel(testName, [
      {
        assetAddress: constants.AddressZero,
        amount: ["100", "100"],
      },
    ]);
    alice = setup.alice;
    bob = setup.bob;
    preCreateChannel = setup.channel;

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });
  });

  it("should create an eth transfer from alice -> bob", async () => {
    // Set test constants
    const assetAddress = constants.AddressZero;
    const transferAmount = "7";

    const { channel, transfer } = await createTransfer(
      preCreateChannel.channelAddress,
      alice,
      bob,
      assetAddress,
      transferAmount,
    );

    const { transferResolver, ...toCompare } = transfer;

    expect(await alice.getChannelState(channel.channelAddress)).to.containSubset(channel);
    expect(await alice.getTransferState(transfer.transferId)).to.containSubset(toCompare);
    expect(await bob.getChannelState(channel.channelAddress)).to.containSubset(channel);
    expect(await bob.getTransferState(transfer.transferId)).to.containSubset(toCompare);
  });

  it.skip("should work for alice creating transfer to bob", async () => {});
  it.skip("should work for alice creating transfer out of channel", async () => {});
  it.skip("should work for bob creating transfer to alice", async () => {});
  it.skip("should work for bob creating transfer out of channel", async () => {});
  it.skip("should work for many concurrent transfers with multiple parties", async () => {});
  it.skip("should work if channel is out of sync", async () => {});
});
