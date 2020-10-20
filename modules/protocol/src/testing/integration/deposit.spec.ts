/* eslint-disable @typescript-eslint/no-empty-function */
import { VectorChannel } from "@connext/vector-contracts";
import { expect, getTestLoggers } from "@connext/vector-utils";
import { FullChannelState, IChannelSigner, IVectorProtocol } from "@connext/vector-types";
import { BigNumber, constants, Contract } from "ethers";

import { depositInChannel, getSetupChannel } from "../utils";
import { env } from "../env";

const testName = "Deposit Integrations";
const { log } = getTestLoggers(testName, env.logLevel);

describe(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;
  let preDepositChannel: FullChannelState;

  let aliceSigner: IChannelSigner;
  let bobSigner: IChannelSigner;

  afterEach(async () => {
    await alice.off();
    await bob.off();
  });

  beforeEach(async () => {
    const setup = await getSetupChannel(testName);
    alice = setup.alice.protocol;
    bob = setup.bob.protocol;
    preDepositChannel = setup.channel;
    aliceSigner = setup.alice.signer;
    bobSigner = setup.bob.signer;

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

  it("should work concurrently", async () => {
    const depositAmount = BigNumber.from("1000");
    const assetId = constants.AddressZero;

    // Perform an alice deposit to make sure multisig is deployed
    const initialDeposit = await depositInChannel(
      preDepositChannel.channelAddress,
      alice,
      aliceSigner,
      bob,
      assetId,
      depositAmount,
    );

    // Have both parties deposit onchain
    await bobSigner.sendTransaction({ value: depositAmount.div(4), to: preDepositChannel.channelAddress });

    const channel = new Contract(preDepositChannel.channelAddress, VectorChannel.abi, aliceSigner);
    const tx = await channel.depositAlice(assetId, depositAmount.div(4), { value: depositAmount.div(4) });
    await tx.wait();

    // Get the predeposit values
    const { processedDepositsA, processedDepositsB } = initialDeposit;

    await Promise.all([
      depositInChannel(preDepositChannel.channelAddress, bob, bobSigner, alice, assetId),
      depositInChannel(preDepositChannel.channelAddress, alice, aliceSigner, bob, assetId),
    ]);

    // Make sure both deposits were accounted for
    const [finalAlice, finalBob] = await Promise.all([
      alice.getChannelState(preDepositChannel.channelAddress),
      bob.getChannelState(preDepositChannel.channelAddress),
    ]);
    expect(finalAlice).to.be.deep.eq(finalBob);
    expect(finalAlice).to.containSubset({
      processedDepositsA: [
        depositAmount
          .div(4)
          .add(processedDepositsA[0])
          .toString(),
      ],
      processedDepositsB: [
        depositAmount
          .div(4)
          .add(processedDepositsB[0])
          .toString(),
      ],
    });
  });

  it.skip("should work if initiator channel is out of sync", async () => {});
  it.skip("should work if responder channel is out of sync", async () => {});
});
