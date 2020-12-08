import { getTestLoggers, expect } from "@connext/vector-utils";
import { AddressZero } from "@ethersproject/constants";

import { env } from "../env";
import { createTransfer, depositInChannel, getSetupChannel, resolveTransfer } from "../utils";

const testName = "Happy Integration";
const { log } = getTestLoggers(testName, env.logLevel);

describe(testName, () => {
  it("should work for a simple ETH setup -> deposit -> create -> resolve flow", async () => {
    // Set test constants
    const assetId = AddressZero;
    const depositAmount = "16";
    const transferAmount = "7";

    // Setup the channel with signers funded onchain
    log.info("Setting up channel");
    const {
      alice: { protocol: alice, signer: aliceSigner },
      bob: { protocol: bob, signer: bobSigner },
      channel,
    } = await getSetupChannel(testName);

    // User (Bob) deposits
    log.info("Bob depositing into channel", { amount: depositAmount });
    await depositInChannel(channel.channelAddress, bob, bobSigner, alice, assetId, depositAmount);

    // Node (Alice) deposits
    log.info("Alice depositing into channel", { amount: depositAmount });
    const postDeposit = await depositInChannel(channel.channelAddress, alice, aliceSigner, bob, assetId, depositAmount);

    // Validate final balance
    log.info("Verifying deposits");
    expect(postDeposit.assetIds).to.be.deep.eq([assetId]);
    expect(postDeposit.balances).to.be.deep.eq([
      { to: [channel.alice, channel.bob], amount: [depositAmount, depositAmount] },
    ]);

    // Create Alice -> Bob transfer
    log.info("Creating transfer", { amount: transferAmount });
    const { transfer } = await createTransfer(channel.channelAddress, alice, bob, assetId, transferAmount);

    // Resolve transfer
    log.info("Resolving transfer", { transferId: transfer.transferId, resolver: transfer.transferResolver });
    await resolveTransfer(channel.channelAddress, transfer, bob, alice);
    await alice.off();
    await bob.off();
  });
});
