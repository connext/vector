import { getTestLoggers } from "@connext/vector-utils";
import { constants } from "ethers";

import { env } from "../env";
import { createTransfer, depositInChannel, expect, getSetupChannel, resolveTransfer } from "../utils";

const testName = "Happy Integration";
const { log } = getTestLoggers(testName, env.logLevel);

describe(testName, () => {
  it("should work for a simple ETH setup -> deposit -> create -> resolve flow", async () => {
    // Set test constants
    const assetId = constants.AddressZero;
    const depositAmount = "16";
    const transferAmount = "7";

    // Setup the channel with signers funded onchain
    log.error("Setting up channel");
    const { alice, aliceSigner, bob, bobSigner, channel } = await getSetupChannel(testName);

    // User (Bob) deposits
    log.error("Bob depositing into channel", { amount: depositAmount });
    await depositInChannel(channel.channelAddress, bob, bobSigner, alice, assetId, depositAmount);

    // Node (Alice) deposits
    log.error("Alice depositing into channel", { amount: depositAmount });
    const postDeposit = await depositInChannel(channel.channelAddress, alice, aliceSigner, bob, assetId, depositAmount);

    // Validate final balance
    log.error("Verifying deposits");
    expect(postDeposit.assetIds).to.be.deep.eq([assetId]);
    expect(postDeposit.balances).to.be.deep.eq([{ to: channel.participants, amount: [depositAmount, depositAmount] }]);

    // Create Alice -> Bob transfer
    log.error("Creating transfer", { amount: transferAmount });
    const { transfer } = await createTransfer(channel.channelAddress, alice, bob, assetId, transferAmount);

    // Resolve transfer
    log.error("Resolving transfer", { transferId: transfer.transferId, resolver: transfer.transferResolver });
    await resolveTransfer(channel.channelAddress, transfer, alice, bob);
  });
});
