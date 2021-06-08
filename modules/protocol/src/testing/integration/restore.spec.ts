import { delay, expect, getTestLoggers } from "@connext/vector-utils";
import { FullChannelState, IChannelSigner, IVectorProtocol, IVectorStore, Result } from "@connext/vector-types";
import { AddressZero } from "@ethersproject/constants";

import { createTransfer, getFundedChannel } from "../utils";
import { env } from "../env";
import { QueuedUpdateError } from "../../errors";

const testName = "Restore Integrations";
const { log } = getTestLoggers(testName, env.logLevel);

describe(testName, () => {
  let alice: IVectorProtocol;
  let bob: IVectorProtocol;

  let abChannelAddress: string;
  let aliceSigner: IChannelSigner;
  let aliceStore: IVectorStore;
  let bobSigner: IChannelSigner;
  let bobStore: IVectorStore;
  let chainId: number;

  afterEach(async () => {
    await alice.off();
    await bob.off();
  });

  beforeEach(async () => {
    const setup = await getFundedChannel(testName, [
      {
        assetId: AddressZero,
        amount: ["100", "100"],
      },
    ]);
    alice = setup.alice.protocol;
    bob = setup.bob.protocol;
    abChannelAddress = setup.channel.channelAddress;
    aliceSigner = setup.alice.signer;
    bobSigner = setup.bob.signer;
    aliceStore = setup.alice.store;
    bobStore = setup.bob.store;
    chainId = setup.channel.networkContext.chainId;

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });
  });

  it("should work with no transfers", async () => {
    // remove channel
    await bobStore.clear();

    // bob should restore
    const restore = await bob.restoreState({ counterpartyIdentifier: alice.publicIdentifier, chainId });
    expect(restore.getError()).to.be.undefined;
    expect(restore.getValue()).to.be.deep.eq(await aliceStore.getChannelState(abChannelAddress));
  });

  it("should work with transfers", async () => {
    // install transfer
    const { transfer } = await createTransfer(abChannelAddress, bob, alice, AddressZero, "1");

    // remove channel
    await bobStore.clear();

    // bob should restore
    const restore = await bob.restoreState({ counterpartyIdentifier: alice.publicIdentifier, chainId });

    // verify results
    expect(restore.getError()).to.be.undefined;
    expect(restore.getValue()).to.be.deep.eq(await aliceStore.getChannelState(abChannelAddress));
    expect(await bob.getActiveTransfers(abChannelAddress)).to.be.deep.eq(
      await alice.getActiveTransfers(abChannelAddress),
    );
  });

  it("should block updates when restoring", async () => {
    // remove channel
    await bobStore.clear();

    // bob should restore, alice should attempt something
    const [_, update] = (await Promise.all([
      bob.restoreState({ counterpartyIdentifier: alice.publicIdentifier, chainId }),
      bob.deposit({ channelAddress: abChannelAddress, assetId: AddressZero }),
    ])) as [Result<FullChannelState>, Result<FullChannelState>];

    // verify update failed
    expect(update.isError).to.be.true;
    expect(update.getError()?.message).to.be.eq(QueuedUpdateError.reasons.ChannelRestoring);
  });
});
