import { FullChannelState } from "@connext/vector-types";
import { Wallet, utils, constants, providers } from "ethers";

import {
  env,
  expect,
  getChannelState,
  getChannelStateByParticipants,
  getConfig,
  reconcileDeposit,
  sendDepositTx,
  setupChannel,
} from "../utils";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const provider = new providers.JsonRpcProvider(env.chainProviders[chainId]);
const wallet = Wallet.fromMnemonic(env.sugarDaddy!).connect(provider);

describe("Duet Happy", () => {
  let alice: { publicIdentifier: string; signerAddress: string };
  let bob: { publicIdentifier: string; signerAddress: string };
  before(async () => {
    alice = await getConfig(env.aliceUrl);
    expect(alice.signerAddress).to.be.a("string");
    expect(alice.publicIdentifier).to.be.a("string");
    bob = await getConfig(env.bobUrl);
    expect(bob.signerAddress).to.be.a("string");
    expect(bob.publicIdentifier).to.be.a("string");

    let tx = await wallet.sendTransaction({ to: alice.signerAddress, value: utils.parseEther("0.1") });
    await tx.wait();
    tx = await wallet.sendTransaction({ to: bob.signerAddress, value: utils.parseEther("0.1") });
    await tx.wait();
  });

  it("alice & bob should setup a channel", async () => {
    const channel = await setupChannel(env.aliceUrl, {
      chainId,
      counterpartyIdentifier: bob.publicIdentifier,
      timeout: "10000",
    });
    expect(channel.channelAddress).to.be.ok;
    const aliceChannel = await getChannelState(env.aliceUrl, channel.channelAddress);
    const bobChannel = await getChannelState(env.bobUrl, channel.channelAddress);
    expect(aliceChannel).to.deep.eq(bobChannel);
  });

  it("alice can deposit ETH into channel", async () => {
    const assetId = constants.AddressZero;
    const depositAmt = utils.parseEther("0.01");
    const channel: FullChannelState = await getChannelStateByParticipants(env.aliceUrl, {
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
      chainId,
    });
    const depositTx = await sendDepositTx(env.aliceUrl, {
      amount: depositAmt.toString(),
      assetId,
      channelAddress: channel.channelAddress,
    });

    expect(depositTx.txHash).to.be.a("string");
    await provider.waitForTransaction(depositTx.txHash);

    const deposit = await reconcileDeposit(env.aliceUrl, { assetId, channelAddress: channel.channelAddress });
    expect(deposit.channelAddress).to.be.a("string");
    const aliceChannel = await getChannelStateByParticipants(env.aliceUrl, {
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
      chainId,
    });

    const bobChannel = await getChannelStateByParticipants(env.bobUrl, {
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
      chainId,
    });

    expect(aliceChannel).to.deep.eq(bobChannel);
  });
});
