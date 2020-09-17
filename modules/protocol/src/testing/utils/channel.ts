import { ChannelFactory, TestToken, VectorChannel } from "@connext/vector-contracts";
import {
  ChainProviders,
  Contract,
  FullChannelState,
  IChannelSigner,
  ILockService,
  IMessagingService,
  IVectorProtocol,
  IVectorStore,
  JsonRpcProvider,
} from "@connext/vector-types";
import { getRandomChannelSigner } from "@connext/vector-utils";
import { Wallet, utils, BigNumber, BigNumberish, constants } from "ethers";
import Pino from "pino";

import { Vector } from "../../vector";
import { MemoryLockService } from "../services/lock";
import { MemoryMessagingService } from "../services/messaging";
import { MemoryStoreService } from "../services/store";

import { env } from "./env";
import { expect } from "./expect";

import { getTestLoggers } from ".";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const providerUrl = env.chainProviders[chainId];

type VectorTestOverrides = {
  messagingService: IMessagingService;
  lockService: ILockService;
  storeService: IVectorStore;
  signer: IChannelSigner;
  chainProviders: ChainProviders;
  logger: Pino.BaseLogger;
};

const fundAddress = async (to: string, sugarDaddy: Wallet): Promise<void> => {
  // Fund with eth
  const ethTx = await sugarDaddy.sendTransaction({ to, value: utils.parseEther("100") });
  if (!ethTx.hash) throw new Error(`Couldn't fund account ${to}`);
  await ethTx.wait();

  // Fund with tokens
  const tokenTx = await new Contract(env.chainAddresses[chainId].TestToken.address, TestToken.abi, sugarDaddy).transfer(
    to,
    utils.parseEther("1000"),
  );
  await tokenTx.wait();
};

export const createVectorInstances = async (
  shareServices = true,
  numberOfEngines = 2,
  overrides: Partial<VectorTestOverrides>[] = [],
): Promise<IVectorProtocol[]> => {
  const sharedMessaging = new MemoryMessagingService();
  const sharedLock = new MemoryLockService();
  return Promise.all(
    Array(numberOfEngines)
      .fill(0)
      .map((_, idx) => {
        const instanceOverrides = overrides[idx] || {};
        const messagingService = shareServices ? sharedMessaging : new MemoryMessagingService();
        const lockService = shareServices ? sharedLock : new MemoryLockService();
        return createVectorInstance({
          messagingService,
          lockService,
          ...instanceOverrides,
        });
      }),
  );
};

export const createVectorInstance = async (overrides: Partial<VectorTestOverrides> = {}): Promise<IVectorProtocol> => {
  const opts = {
    messagingService: new MemoryMessagingService(),
    lockService: new MemoryLockService(),
    storeService: new MemoryStoreService(),
    signer: getRandomChannelSigner(env.chainProviders[chainId]),
    chainProviders: env.chainProviders,
    logger: getTestLoggers("vector").log,
    ...overrides,
  };
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-expect-error
  const vector = await Vector.connect(...Object.values(opts));
  expect(vector.signerAddress).to.be.eq(opts.signer.address);
  expect(vector.publicIdentifier).to.be.eq(opts.signer.publicIdentifier);
  return vector;
};

export const deployChannelWithDepositA = async (
  depositAmount: BigNumber,
  assetId: string,
  alice: IChannelSigner,
  bobAddr: string,
): Promise<string> => {
  const factory = new Contract(env.chainAddresses[chainId].ChannelFactory.address, ChannelFactory.abi, alice);
  const created = new Promise<string>((res) => {
    factory.once(factory.filters.ChannelCreation(), (data) => {
      res(data);
    });
  });
  const tx = await factory.createChannelAndDepositA(alice.address, bobAddr, assetId, depositAmount, {
    value: depositAmount,
  });
  await tx.wait();
  const channelAddress = await created;
  expect(await alice.provider!.getBalance(channelAddress)).to.be.eq(depositAmount);
  return channelAddress;
};

export const setupChannel = async (alice: IVectorProtocol, bob: IVectorProtocol): Promise<FullChannelState<any>> => {
  const ret = await alice.setup({
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
  expect(ret.isError).to.not.be.ok;
  const channel = ret.getValue()!;

  // TODO: should we add stronger assertions here?

  // Verify stored channel
  const aliceChannel = await alice.getChannelState(channel.channelAddress);
  const bobChannel = await bob.getChannelState(channel.channelAddress);
  expect(aliceChannel).to.deep.eq(channel);
  expect(bobChannel).to.deep.eq(channel);
  return channel;
};

export const depositAOnchain = async (
  channelAddress: string,
  latestDepositNonce: number,
  depositorSigner: IChannelSigner,
  counterparty: IVectorProtocol,
  assetId: string = constants.AddressZero,
  amount: BigNumberish = 15,
): Promise<void> => {
  const value = BigNumber.from(amount);
  if (latestDepositNonce === 0) {
    // First node deposit, must deploy channel
    // Deploy multisig with deposit
    await deployChannelWithDepositA(value, assetId, depositorSigner, counterparty.signerAddress);
  } else {
    // Call deposit on the multisig
    const tx = await new Contract(channelAddress, VectorChannel.abi, depositorSigner).depositA(assetId, amount, {
      value,
    });
    await tx.wait();
  }
};

export const depositInChannel = async (
  channelAddress: string,
  depositor: IVectorProtocol,
  depositorSigner: IChannelSigner,
  counterparty: IVectorProtocol,
  assetId: string = constants.AddressZero,
  amount?: BigNumberish,
): Promise<FullChannelState<any>> => {
  // If amount is not supplied, simply reconcile
  // deposits immediately
  if (!amount) {
    const ret = await depositor.deposit({
      assetId,
      channelAddress,
    });
    expect(ret.isError).to.be.false;
    return ret.getValue();
  }

  const value = BigNumber.from(amount);

  // Deploy multsig if needed
  const channel = await depositor.getChannelState(channelAddress);
  const isDepositA = channel!.publicIdentifiers[0] === depositor.publicIdentifier;
  if (isDepositA) {
    await depositAOnchain(channelAddress, channel!.latestDepositNonce, depositorSigner, counterparty, assetId, amount);
  } else {
    // Deposit onchain
    const tx =
      assetId === constants.AddressZero
        ? await depositorSigner.sendTransaction({ value, to: channelAddress })
        : await new Contract(assetId, TestToken.abi, depositorSigner).transfer(channelAddress, value);

    await tx.wait();
  }

  // Reconcile with channel
  const ret = await depositor.deposit({
    assetId,
    channelAddress,
  });
  expect(ret.isError).to.be.false;

  const postDeposit = ret.getValue()!;
  expect(postDeposit.latestDepositNonce).to.be.eq(
    isDepositA ? channel!.latestDepositNonce + 1 : channel!.latestDepositNonce,
  );
  expect(postDeposit.assetIds).to.be.deep.eq([...new Set(channel!.assetIds.concat(assetId))]);

  const assetIdx = postDeposit!.assetIds.findIndex((a) => a === assetId);
  const postDepositBal = postDeposit.balances[assetIdx];
  const postDepositLocked = postDeposit.lockedBalance[assetIdx] || "0";

  // Make sure the onchain balance of the channel is equal to the
  // sum of the locked balance + channel balance
  const channelTotal = BigNumber.from(postDepositLocked)
    .add(postDepositBal.amount[0])
    .add(postDepositBal.amount[1]);

  const onchainTotal =
    assetId === constants.AddressZero
      ? await depositorSigner.provider!.getBalance(channelAddress)
      : await new Contract(assetId, TestToken.abi, depositorSigner).balanceOf(channelAddress);

  expect(onchainTotal).to.be.eq(channelTotal);
  return postDeposit;
};

// This function will return a setup channel between two participants
// Alice and Bob (both of whom have funds onchain). Once the channel
// is setup, it is ready to be updated.
export const getSetupChannel = async (
  testName = "setup",
): Promise<{
  channel: FullChannelState;
  alice: IVectorProtocol;
  bob: IVectorProtocol;
  aliceSigner: IChannelSigner;
  bobSigner: IChannelSigner;
}> => {
  // First, get the signers and fund the accounts
  const [aliceSigner, bobSigner] = Array(2)
    .fill(0)
    .map((_) => getRandomChannelSigner(env.chainProviders[chainId]));

  // Fund the signer addresses with the sugar daddy account
  const wallet = env.sugarDaddy.connect(new JsonRpcProvider(env.chainProviders[chainId]));
  await fundAddress(aliceSigner.address, wallet);
  await fundAddress(bobSigner.address, wallet);

  // Create the vector instances
  const [alice, bob] = await createVectorInstances(true, 2, [
    { signer: aliceSigner, logger: getTestLoggers(testName).log },
    { signer: bobSigner, logger: getTestLoggers(testName).log },
  ]);

  // Setup the channel
  const channel = await setupChannel(alice, bob);
  return {
    channel,
    alice,
    bob,
    aliceSigner,
    bobSigner,
  };
};

// This function will return a funded channel between two participants
// Alice and Bob.
// NOTE: This function will only deploy the multisig IFF an amounts[0]
// is greater than 0 for any of the assets. Otherwise, (i.e only user
// is funded) it will not deploy the multisig
export const getFundedChannel = async (
  testName = "deposit",
  balances: { assetId: string; amount: [BigNumberish, BigNumberish] }[] = [
    { assetId: constants.AddressZero, amount: [100, 0] },
  ],
): Promise<{
  channel: FullChannelState;
  alice: IVectorProtocol;
  bob: IVectorProtocol;
}> => {
  const { alice, bob, channel: setupChannel, aliceSigner, bobSigner } = await getSetupChannel(testName);
  // Fund the channel for all balances
  for (const requestedDeposit of balances) {
    const { assetId, amount } = requestedDeposit;
    const [depositAlice, depositBob] = amount;

    // Perform the alice deposit
    if (constants.Zero.lt(depositAlice)) {
      await depositInChannel(setupChannel.channelAddress, alice, aliceSigner, bob, assetId, depositAlice);
    }

    // Perform the bob deposit
    if (constants.Zero.lt(depositBob)) {
      await depositInChannel(setupChannel.channelAddress, bob, bobSigner, alice, assetId, depositBob);
    }
  }

  const channel = (await alice.getChannelState(setupChannel.channelAddress))!;
  return {
    channel,
    alice,
    bob,
  };
};
