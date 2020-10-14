/* eslint-disable @typescript-eslint/no-empty-function */
import { getTestLoggers } from "@connext/vector-utils";
import { IVectorProtocol } from "@connext/vector-types";
import { constants } from "ethers";

import { createTransfer, getFundedChannel, resolveTransfer } from "../utils";
import { env } from "../env";

const testName = "Resolve Integrations";
const { log } = getTestLoggers(testName, env.logLevel);
describe(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;
  let channelAddress: string;

  afterEach(async () => {
    await alice.off();
    await bob.off();
  });

  beforeEach(async () => {
    const setup = await getFundedChannel(testName, [
      {
        assetId: constants.AddressZero,
        amount: ["14", 0],
      },
    ]);
    alice = setup.alice.protocol;
    bob = setup.bob.protocol;
    channelAddress = setup.channel.channelAddress;

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });
  });

  it("should resolve an eth transfer from alice -> bob", async () => {
    // Set test constants
    const assetId = constants.AddressZero;
    const transferAmount = "7";

    const { transfer } = await createTransfer(channelAddress, alice, bob, assetId, transferAmount);

    await resolveTransfer(channelAddress, transfer, bob, alice);
  });

  // We need this to test whether resolve still works if the funds in the transfer are burned
  it.skip("should work for alice resolving an eth transfer", async () => {});
  it.skip("should work for alice resolving an eth transfer out of channel", async () => {});
  it.skip("should work for alice resolving a token transfer", async () => {});
  it.skip("should work for alice resolving a token transfer out of channel", async () => {});
  it.skip("should work for bob resolving an eth transfer", async () => {});
  it.skip("should work for bob resolving an eth transfer out of channel", async () => {});
  it.skip("should work for bob resolving a token transfer", async () => {});
  it.skip("should work for bob resolving a token transfer out of channel", async () => {});

  it("should work concurrently", async () => {
    // Set test constants
    const assetId = constants.AddressZero;
    const transferAmount = "7";

    // Create two transfers from alice -> bob
    const { transfer: transfer1 } = await createTransfer(channelAddress, alice, bob, assetId, transferAmount);
    const { transfer: transfer2 } = await createTransfer(channelAddress, alice, bob, assetId, transferAmount);

    // Resolve both
    await Promise.all([
      resolveTransfer(channelAddress, transfer1, bob, alice),
      resolveTransfer(channelAddress, transfer2, bob, alice),
    ]);
  });

  it.skip("should work if initiator channel is out of sync", async () => {});
  it.skip("should work if responder channel is out of sync", async () => {});
});
