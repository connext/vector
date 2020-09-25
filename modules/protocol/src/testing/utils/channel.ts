import { ChannelFactory, TestToken, ChannelMastercopy, VectorOnchainService } from "@connext/vector-contracts";
import {
  Contract,
  FullChannelState,
  IChannelSigner,
  ILockService,
  IMessagingService,
  IVectorProtocol,
  IVectorStore,
  DEFAULT_TRANSFER_TIMEOUT,
  IVectorOnchainService,
} from "@connext/vector-types";
import {
  getRandomChannelSigner,
} from "@connext/vector-utils";
import { BigNumber, BigNumberish, constants } from "ethers";
import Pino from "pino";

import { env } from "../env";
import { chainId, provider } from "../constants";
import { Vector } from "../../vector";
import { MemoryLockService } from "../services/lock";
import { MemoryMessagingService } from "../services/messaging";
import { MemoryStoreService } from "../services/store";

import { expect } from "./expect";
import { fundAddress } from "./funding";
import { getTestLoggers } from "./logger";

type VectorTestOverrides = {
  messagingService: IMessagingService;
  lockService: ILockService;
  storeService: IVectorStore;
  signer: IChannelSigner;
  onchainService: IVectorOnchainService;
  logger: Pino.BaseLogger;
};

export const createVectorInstances = async (
  shareServices = true,
  numberOfEngines = 2,
  overrides: Partial<VectorTestOverrides>[] = [],
): Promise<IVectorProtocol[]> => {
  const sharedMessaging = new MemoryMessagingService();
  const sharedLock = new MemoryLockService();
  const sharedChain = new VectorOnchainService({ [chainId]: provider }, Pino());
  return Promise.all(
    Array(numberOfEngines)
      .fill(0)
      .map(async (_, idx) => {
        const instanceOverrides = overrides[idx] || {};
        const messagingService = shareServices ? sharedMessaging : new MemoryMessagingService();
        const lockService = shareServices ? sharedLock : new MemoryLockService();
        const logger = instanceOverrides.logger ?? Pino();
        const onchainService = shareServices
          ? sharedChain
          : new VectorOnchainService(
              { [chainId]: provider },
              logger.child({ module: "VectorOnchainService" }),
            );
        const opts = {
          messagingService,
          lockService,
          storeService: new MemoryStoreService(),
          signer: getRandomChannelSigner(provider),
          onchainService,
          logger,
          ...instanceOverrides,
        };
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        const vector = await Vector.connect(...Object.values(opts));
        expect(vector.signerAddress).to.be.eq(opts.signer.address);
        expect(vector.publicIdentifier).to.be.eq(opts.signer.publicIdentifier);
        return vector;
      }),
  );
};

export const setupChannel = async (alice: IVectorProtocol, bob: IVectorProtocol): Promise<FullChannelState<any>> => {
  const ret = await alice.setup({
    counterpartyIdentifier: bob.publicIdentifier,
    networkContext: {
      chainId,
      channelFactoryAddress: env.chainAddresses[chainId].ChannelFactory.address,
      providerUrl: provider.connection.url,
      channelMastercopyAddress: env.chainAddresses[chainId].ChannelMastercopy.address,
    },
    timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
  });
  expect(ret.getError()).to.be.undefined;
  const channel = ret.getValue()!;
  // Verify stored channel
  const aliceChannel = await alice.getChannelState(channel.channelAddress);
  const bobChannel = await bob.getChannelState(channel.channelAddress);
  expect(aliceChannel).to.deep.eq(channel);
  expect(bobChannel).to.deep.eq(channel);
  expect(channel.participants).to.be.deep.eq([alice.signerAddress, bob.signerAddress]);
  expect(channel.publicIdentifiers).to.be.deep.eq([alice.publicIdentifier, bob.publicIdentifier]);
  return channel;
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
    expect(ret.getError()).to.be.undefined;
    return ret.getValue();
  }
  const value = BigNumber.from(amount);
  // Deploy multsig if needed
  const channel = await depositor.getChannelState(channelAddress);
  const isDepositA = channel!.publicIdentifiers[0] === depositor.publicIdentifier;
  // NOTE: sometimes deposit fails, and it seems like its because it is
  // not detecting depositA properly, only happens sometimes so leave
  // this log for now!
  if (isDepositA) {
    const value = BigNumber.from(amount);
    // Call deposit on the multisig
    try {
      const tx = await (
        new Contract(channelAddress, ChannelMastercopy.abi, depositorSigner)
      ).depositA(
        assetId,
        value,
        { value },
      );
      await tx.wait();
    } catch (e) {
      // Assume this happened because it wasn't deployed
      await depositorSigner.connectProvider(provider);
      // Get the previous balance before deploying
      const prev =
        assetId === constants.AddressZero
          ? await depositorSigner.provider!.getBalance(channelAddress)
          : await new Contract(assetId, TestToken.abi, depositorSigner).balanceOf(channelAddress);
      // Deploy with deposit
      const factory = new Contract(env.chainAddresses[chainId].ChannelFactory.address, ChannelFactory.abi, depositorSigner);
      const created = new Promise<string>(res => {
        factory.once(factory.filters.ChannelCreation(), data => {
          res(data);
        });
      });
      const tx = await factory.createChannelAndDepositA(depositorSigner.address, counterparty.address, assetId, value, {
        value,
      });
      await tx.wait();
      const deployedAddr = await created;
      expect(deployedAddr).to.be.eq(channelAddress);
      // Verify onchain values updated
      const totalDepositedA = await new Contract(channelAddress, ChannelMastercopy.abi, depositorSigner).totalDepositedA(assetId);
      expect(totalDepositedA).to.be.eq(value);
      expect(await depositorSigner.provider!.getBalance(channelAddress)).to.be.eq(value.add(prev));
      return channelAddress;
    }
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
  expect(ret.getError()).to.be.undefined;
  const postDeposit = ret.getValue()!;
  expect(postDeposit.assetIds).to.be.deep.eq([...new Set(channel!.assetIds.concat(assetId))]);
  const assetIdx = postDeposit!.assetIds.findIndex(a => a === assetId);
  if (isDepositA) {
    expect(
      value.add(channel!.processedDepositsA[assetIdx] || "0"),
    ).to.equal(
      BigNumber.from(postDeposit.processedDepositsA[0]),
    );
  } else {
    expect(value.add(channel!.processedDepositsB[assetIdx]).eq(BigNumber.from(postDeposit.processedDepositsB))).to.be
      .true;
  }
  // Make sure the onchain balance of the channel is equal to the
  // sum of the locked balance + channel balance
  // TODO does this even make sense to do anymore?
  // const totalDeposited = BigNumber.from(channel!.processedDepositsA[assetIdx]).add(
  //   channel!.processedDepositsB[assetIdx],
  // );
  // const onchainTotal =
  //   assetId === constants.AddressZero
  //     ? await depositorSigner.provider!.getBalance(channelAddress)
  //     : await new Contract(assetId, TestToken.abi, depositorSigner).balanceOf(channelAddress);
  // expect(onchainTotal).to.be.eq(channelTotal);
  console.log(`Success! yay`);
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
  const [aliceSigner, bobSigner] = [
    getRandomChannelSigner(provider),
    getRandomChannelSigner(provider),
  ];
  // Fund the signer addresses with the sugar daddy account
  await fundAddress(aliceSigner.address);
  await fundAddress(bobSigner.address);
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
