import { env, expect, clearStore, getConfig, setupChannel } from "../utils";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);

describe.skip("Duet Setup", () => {
  beforeEach(async () => {
    await clearStore(env.aliceUrl);
    await clearStore(env.bobUrl);
  });

  it("alice & bob should setup a channel", async () => {
    const bob = await getConfig(env.bobUrl);
    const channel = await setupChannel(env.aliceUrl, {
      chainId,
      counterpartyIdentifier: bob.publicIdentifier,
      timeout: "8640",
    });
    expect(channel.channelAddress).to.be.ok;
  });
});
