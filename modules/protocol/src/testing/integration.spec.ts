import { ChannelFactory } from "@connext/vector-contracts";
import { JsonRpcProvider } from "@connext/vector-types";
import { ChannelSigner, getRandomChannelSigner, getGasPrice } from "@connext/vector-utils";
import { BigNumber, constants, Contract } from "ethers";

import { Vector } from "../vector";

import { MemoryLockService } from "./services/lock";
import { MemoryMessagingService } from "./services/messaging";
import { MemoryStoreService } from "./services/store";
import { env, expect, getTestLoggers } from "./utils";
import { setupChannel } from "./utils/channel";

const testName = "Happy Integrations";
const { log } = getTestLoggers(testName);
describe(testName, () => {
  let alice: Vector;
  let bob: Vector;

  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const providerUrl = env.chainProviders[chainId];
  const provider = new JsonRpcProvider(providerUrl);
  const wallet = env.sugarDaddy.connect(provider);

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
    const channel = await setupChannel(alice, bob);

    const aliceChannel = await alice.getChannelState(channel.channelAddress);
    const bobChannel = await bob.getChannelState(channel.channelAddress);

    expect(aliceChannel).to.deep.eq(bobChannel);
  });

  // NOTE: the following deposit test cases are *extremely* simple tests
  // and do not represent a complete deposit tests
  it.only("should deposit eth for Alice (depositA)", async () => {
    // Setup the channel
    const channel = await setupChannel(alice, bob);

    const aliceChannel = await alice.getChannelState(channel.channelAddress);
    const bobChannel = await bob.getChannelState(channel.channelAddress);

    expect(aliceChannel).to.deep.eq(bobChannel);

    const depositAmount = BigNumber.from("1000");
    const assetId = constants.AddressZero;

    // Deploy the multisig with a deposit
    console.log(`proxy addr`, env.chainAddresses[chainId].ChannelFactory.address);
    console.log(`initiator addr`, alice.signerAddress);
    console.log(`responder addr`, bob.signerAddress);
    const factory = new Contract(env.chainAddresses[chainId].ChannelFactory.address, ChannelFactory.abi);
    const tx = await factory
      .connect(wallet)
      .createChannel(alice.signerAddress, bob.signerAddress);
    // .createChannelAndDepositA(alice.signerAddress, bob.signerAddress, constants.AddressZero, depositAmount, {
    //   value: depositAmount,
    //   gasLimit: BigNumber.from(500_000),
    //   gasPrice: getGasPrice(new JsonRpcProvider(providerUrl)),
    // });
    await tx.wait();
    expect(await provider.getBalance(aliceChannel!.channelAddress)).to.be.eq(depositAmount);

    // Reconcile the depositA
    const depositRet = await alice.deposit({
      channelAddress: aliceChannel!.channelAddress,
      assetId,
    });
    expect(depositRet.isError).to.be.false;

    const aliceDeposited = await alice.getChannelState(channel.channelAddress);
    expect(aliceDeposited?.balances).to.containSubset({
      to: aliceChannel?.participants,
      amount: [depositAmount.toString(), "0"],
    });
    expect(aliceDeposited?.latestDepositNonce).to.be.eq(aliceChannel!.nonce + 1);
    expect(aliceDeposited?.assetIds).to.containSubset([constants.AddressZero]);
    expect(await bob.getChannelState(aliceChannel!.channelAddress)).to.containSubset(aliceDeposited);
  });

  // TODO: the following deposit test cases are *extremely* simple tests
  // and do not represent a complete deposit tests
  it("should deposit eth for Bob (multisig deposit)", async () => {});
});
