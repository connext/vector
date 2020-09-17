import { ChannelFactory } from "@connext/vector-contracts";
import { JsonRpcProvider } from "@connext/vector-types";
import { ChannelSigner, getRandomChannelSigner } from "@connext/vector-utils";
import { BigNumber, constants, Contract } from "ethers";

import { Vector } from "../vector";

import { MemoryLockService } from "./services/lock";
import { MemoryMessagingService } from "./services/messaging";
import { MemoryStoreService } from "./services/store";
import { env, expect, getTestLoggers } from "./utils";

const testName = "Happy Integrations";
const { log } = getTestLoggers(testName);
describe(testName, () => {
  let alice: Vector;
  let bob: Vector;

  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const providerUrl = env.chainProviders[chainId];
  const wallet = global["wallet"].connect(new JsonRpcProvider(providerUrl));

  beforeEach(async () => {
    const messaging = new MemoryMessagingService();
    const lock = new MemoryLockService();

    alice = await Vector.connect(
      messaging,
      lock,
      new MemoryStoreService(),
      new ChannelSigner(wallet.privateKey, providerUrl),
      env.chainProviders,
      log.child({ participant: "Alice" }),
    );

    bob = await Vector.connect(
      messaging,
      lock,
      new MemoryStoreService(),
      getRandomChannelSigner(),
      env.chainProviders,
      log.child({ participant: "Bob" }),
    );

    log.info({
      alice: alice.publicIdentifier,
      bob: bob.publicIdentifier,
    });
  });

  it("should setup a channel between Alice and Bob", async () => {
    const channel = await alice.setup({
      counterpartyIdentifier: bob.publicIdentifier,
      networkContext: {
        adjudicatorAddress: env.chainAddresses[chainId].Adjudicator.address,
        chainId,
        channelFactoryAddress: env.chainAddresses[chainId].ChannelFactory.address,
        providerUrl,
        vectorChannelMastercopyAddress: env.chainAddresses[chainId].VectorChannel.address,
      },
      timeout: "3600",
    });
    expect(channel.isError).to.not.be.ok;

    const aliceChannel = await alice.getChannelState(channel.getValue().channelAddress);
    const bobChannel = await bob.getChannelState(channel.getValue().channelAddress);

    expect(aliceChannel).to.deep.eq(bobChannel);
  });

  // TODO: the following deposit test cases are *extremely* simple tests
  // and do not represent a complete deposit tests
  it("should deposit eth for Alice (depositA)", async () => {
    // Setup the channel
    const channel = await alice.setup({
      counterpartyIdentifier: bob.publicIdentifier,
      networkContext: {
        adjudicatorAddress: env.chainAddresses[chainId].Adjudicator.address,
        chainId,
        channelFactoryAddress: env.chainAddresses[chainId].ChannelFactory.address,
        providerUrl,
        vectorChannelMastercopyAddress: env.chainAddresses[chainId].VectorChannel.address,
      },
      timeout: "3600",
    });
    expect(channel.isError).to.not.be.ok;

    const aliceChannel = await alice.getChannelState(channel.getValue().channelAddress);
    const bobChannel = await bob.getChannelState(channel.getValue().channelAddress);

    expect(aliceChannel).to.deep.eq(bobChannel);

    const depositAmount = BigNumber.from("1000");

    // Deploy the multisig with a deposit
    const factory = new Contract(env.chainAddresses[chainId].ChannelFactory.address, ChannelFactory.abi, wallet);
    const created = new Promise((resolve) => {
      factory.once(factory.filters.ChannelCreation(), (data) => {
        resolve(data);
      });
    });
    const tx = await factory.createChannelAndDepositA(
      alice.signerAddress,
      bob.signerAddress,
      constants.AddressZero,
      depositAmount,
      { value: depositAmount.toString() },
    );
    await tx.wait();
    const channelAddress = (await created) as string;
    expect(channelAddress).to.be.eq(aliceChannel?.channelAddress);

    // Deposit into channel
    
  });

  // TODO: the following deposit test cases are *extremely* simple tests
  // and do not represent a complete deposit tests
  it("should deposit eth for Bob (multisig deposit)", async () => {});
});
