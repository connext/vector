/* eslint-disable @typescript-eslint/no-empty-function */
import { getTestLoggers } from "@connext/vector-utils";
import { FullChannelState, IVectorProtocol } from "@connext/vector-types";
import { constants } from "ethers";

import { env } from "../env";
import { createTransfer, expect, getFundedChannel } from "../utils";

const testName = "Create Integrations";
const { log } = getTestLoggers(testName, env.logLevel);
describe(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;

  let preCreateChannel: FullChannelState;

  beforeEach(async () => {
    const setup = await getFundedChannel(testName, [
      {
        assetId: constants.AddressZero,
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
    const assetId = constants.AddressZero;
    const transferAmount = "7";
    const { channel, transfer } = await createTransfer(
      preCreateChannel.channelAddress,
      alice,
      bob,
      assetId,
      transferAmount,
    );
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
