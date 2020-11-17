import { ChannelFactory, TestToken, VectorChannel, VectorChainReader } from "@connext/vector-contracts";
import {
  FullChannelState,
  IChannelSigner,
  ILockService,
  IMessagingService,
  IVectorProtocol,
  IVectorStore,
  DEFAULT_TRANSFER_TIMEOUT,
  IVectorChainReader,
  SetupParams,
  UpdateType,
} from "@connext/vector-types";
import {
  getRandomChannelSigner,
  getTestLoggers,
  expect,
  MemoryStoreService,
  MemoryLockService,
  MemoryMessagingService,
  getSignerAddressFromPublicIdentifier,
} from "@connext/vector-utils";
import { Contract } from "@ethersproject/contracts";
import { BigNumber, BigNumberish, constants } from "ethers";
import Pino from "pino";

import { env } from "../env";
import { chainId, provider } from "../constants";
import { Vector } from "../../vector";

import { fundAddress } from "./funding";

type VectorTestOverrides = {
  messagingService: IMessagingService;
  lockService: ILockService;
  storeService: IVectorStore;
  signer: IChannelSigner;
  chainReader: IVectorChainReader;
  logger: Pino.BaseLogger;
};

// NOTE: when operating with three counterparties, they must
// all share a messaging service
const sharedMessaging = new MemoryMessagingService();
const sharedLock = new MemoryLockService();
const sharedChain = new VectorChainReader({ [chainId]: provider }, Pino());

export const createVectorInstances = async (
  shareServices = true,
  numberOfEngines = 2,
  overrides: Partial<VectorTestOverrides>[] = [],
): Promise<IVectorProtocol[]> => {
  return Promise.all(
    Array(numberOfEngines)
      .fill(0)
      .map(async (_, idx) => {
        const instanceOverrides = overrides[idx] || {};
        const messagingService = shareServices ? sharedMessaging : new MemoryMessagingService();
        const lockService = shareServices ? sharedLock : new MemoryLockService();
        const logger = instanceOverrides.logger ?? Pino();
        const chainReader = shareServices
          ? sharedChain
          : new VectorChainReader({ [chainId]: provider }, logger.child({ module: "VectorChainReader" }));

        const opts = {
          messagingService,
          lockService,
          storeService: new MemoryStoreService(),
          signer: getRandomChannelSigner(provider),
          chainReader,
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
  const setupParams: SetupParams = {
    counterpartyIdentifier: bob.publicIdentifier,
    timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
    networkContext: {
      chainId,
      providerUrl: Object.values(env.chainProviders)[0] as string,
      channelFactoryAddress: env.chainAddresses[chainId].channelFactoryAddress,
      transferRegistryAddress: env.chainAddresses[chainId].transferRegistryAddress,
    },
  };
  const ret = await alice.setup(setupParams);
  expect(ret.getError()).to.be.undefined;
  const channel = ret.getValue()!;
  // Verify stored channel
  const aliceChannel = await alice.getChannelState(channel.channelAddress);
  const bobChannel = await bob.getChannelState(channel.channelAddress);
  expect(aliceChannel).to.deep.eq(channel);
  expect(bobChannel).to.deep.eq(channel);
  expect(channel).to.containSubset({
    alice: alice.signerAddress,
    bob: getSignerAddressFromPublicIdentifier(setupParams.counterpartyIdentifier),
    aliceIdentifier: alice.publicIdentifier,
    bobIdentifier: setupParams.counterpartyIdentifier,
    nonce: 1,
    balances: [],
    assetIds: [],
    processedDepositsA: [],
    processedDepositsB: [],
    merkleRoot: constants.HashZero,
    networkContext: setupParams.networkContext,
    latestUpdate: {
      type: UpdateType.setup,
      fromIdentifier: alice.publicIdentifier,
      toIdentifier: setupParams.counterpartyIdentifier,
      details: {
        timeout: setupParams.timeout,
        networkContext: setupParams.networkContext,
      },
    },
  });
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
  const isDepositA = channel!.aliceIdentifier === depositor.publicIdentifier;
  // NOTE: sometimes deposit fails, and it seems like its because it is
  // not detecting depositA properly, only happens sometimes so leave
  // this log for now!
  if (isDepositA) {
    const value = BigNumber.from(amount);
    // Call deposit on the multisig
    try {
      const channel = new Contract(channelAddress, VectorChannel.abi, depositorSigner);
      const totalDepositsAlice = await channel.getTotalDepositsAlice(assetId);
      const tx = await channel.depositAlice(assetId, value, { value });
      await tx.wait();
      expect(await channel.getTotalDepositsAlice(assetId)).to.equal(totalDepositsAlice.add(value));
    } catch (e) {
      // Assume this happened because it wasn't deployed
      await depositorSigner.connectProvider(provider);
      // Get the previous balance before deploying
      const prev =
        assetId === constants.AddressZero
          ? await depositorSigner.provider!.getBalance(channelAddress)
          : await new Contract(assetId, TestToken.abi, depositorSigner).balanceOf(channelAddress);
      const factory = new Contract(
        env.chainAddresses[chainId].channelFactoryAddress,
        ChannelFactory.abi,
        depositorSigner,
      );
      const created = new Promise<string>(res => {
        factory.once(factory.filters.ChannelCreation(), data => {
          res(data);
        });
      });
      const tx = await factory.createChannelAndDepositAlice(
        depositorSigner.address,
        counterparty.signerAddress,
        assetId,
        value,
        { value },
      );
      await tx.wait();
      const deployedAddr = await created;
      expect(deployedAddr).to.be.eq(channelAddress);
      // Verify onchain values updated
      const totalDepositsAlice = await new Contract(
        channelAddress,
        VectorChannel.abi,
        depositorSigner,
      ).getTotalDepositsAlice(assetId);
      expect(totalDepositsAlice).to.be.eq(value);
      expect(await depositorSigner.provider!.getBalance(channelAddress)).to.be.eq(value.add(prev));
    }
  } else {
    try {
      // This call will fail if the channel isn't created
      const channel = new Contract(channelAddress, VectorChannel.abi, depositorSigner);
      const totalDepositsBob = await channel.getTotalDepositsBob(assetId);
      // Deposit onchain
      const tx =
        assetId === constants.AddressZero
          ? await depositorSigner.sendTransaction({ value, to: channelAddress })
          : await new Contract(assetId, TestToken.abi, depositorSigner).transfer(channelAddress, value);
      await tx.wait();
      // Verify onchain values updated
      expect(await channel.getTotalDepositsBob(assetId)).to.be.eq(totalDepositsBob.add(value));
    } catch (e) {
      if (e.message.includes("Expected")) {
        throw e;
      }
      // If not assertion fail, assume we threw because channel isn't deployed
      const prev =
        assetId === constants.AddressZero
          ? await depositorSigner.provider!.getBalance(channelAddress)
          : await new Contract(assetId, TestToken.abi, depositorSigner).balanceOf(channelAddress);
      const factory = new Contract(
        env.chainAddresses[chainId].channelFactoryAddress,
        ChannelFactory.abi,
        depositorSigner,
      );
      const created = new Promise<string>(res => {
        factory.once(factory.filters.ChannelCreation(), data => {
          res(data);
        });
      });
      const createTx = await factory.createChannel(counterparty.signerAddress, depositorSigner.address);
      await createTx.wait();
      const deployedAddr = await created;
      expect(deployedAddr).to.equal(channelAddress);
      const tx =
        assetId === constants.AddressZero
          ? await depositorSigner.sendTransaction({ value, to: deployedAddr })
          : await new Contract(assetId, TestToken.abi, depositorSigner).transfer(deployedAddr, value);
      await tx.wait();
      // Verify onchain values updated
      const totalDepositsBob = await new Contract(deployedAddr, VectorChannel.abi, depositorSigner).getTotalDepositsBob(
        assetId,
      );
      expect(totalDepositsBob).to.be.eq(value);
      expect(await depositorSigner.provider!.getBalance(channelAddress)).to.be.eq(value.add(prev));
    }
  }
  // Reconcile with channel
  const ret = await depositor.deposit({
    assetId,
    channelAddress,
  });
  expect(ret.getError()).to.be.undefined;
  const postDeposit = ret.getValue()!;
  expect(await depositor.getChannelState(channelAddress)).to.be.deep.eq(postDeposit);
  expect(await counterparty.getChannelState(channelAddress)).to.be.deep.eq(postDeposit);
  expect(postDeposit).to.containSubset({
    assetIds: [...new Set(channel!.assetIds.concat(assetId))],
  });
  const assetIdx = postDeposit!.assetIds.findIndex(a => a === assetId);
  if (isDepositA) {
    expect(value.add(channel!.processedDepositsA[assetIdx] || "0")).to.equal(
      BigNumber.from(postDeposit.processedDepositsA[0]),
    );
  } else {
    expect(value.add(channel!.processedDepositsB[assetIdx] || "0")).to.equal(
      BigNumber.from(postDeposit.processedDepositsB[assetIdx]),
    );
  }
  return postDeposit;
};

// This function will return a setup channel between two participants
// Alice and Bob (both of whom have funds onchain). Once the channel
// is setup, it is ready to be updated.
export const getSetupChannel = async (
  testName = "setup",
  providedAlice?: { signer: IChannelSigner; store: IVectorStore },
): Promise<{
  channel: FullChannelState;
  alice: { protocol: IVectorProtocol; store: IVectorStore; signer: IChannelSigner };
  bob: { protocol: IVectorProtocol; store: IVectorStore; signer: IChannelSigner };
}> => {
  // First, get the signers and fund the accounts
  const aliceSigner = providedAlice?.signer ?? getRandomChannelSigner(provider);
  const bobSigner = getRandomChannelSigner(provider);
  // Fund the signer addresses with the sugar daddy account
  await fundAddress(aliceSigner.address);
  await fundAddress(bobSigner.address);
  // Create the store services
  const aliceStore = providedAlice?.store ?? new MemoryStoreService();
  const bobStore = new MemoryStoreService();
  // Create the vector instances
  const [alice, bob] = await createVectorInstances(true, 2, [
    {
      signer: aliceSigner,
      logger: getTestLoggers(testName, env.logLevel).log,
      storeService: aliceStore,
    },
    { signer: bobSigner, logger: getTestLoggers(testName, env.logLevel).log, storeService: bobStore },
  ]);
  // Setup the channel
  const channel = await setupChannel(alice, bob);
  return {
    channel,
    alice: { protocol: alice, signer: aliceSigner, store: aliceStore },
    bob: { protocol: bob, signer: bobSigner, store: bobStore },
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
  providedAlice?: { signer: IChannelSigner; store: IVectorStore },
): Promise<{
  channel: FullChannelState;
  alice: { protocol: IVectorProtocol; store: IVectorStore; signer: IChannelSigner };
  bob: { protocol: IVectorProtocol; store: IVectorStore; signer: IChannelSigner };
}> => {
  const { alice: aliceInfo, bob: bobInfo, channel: setupChannel } = await getSetupChannel(testName, providedAlice);
  // Fund the channel for all balances
  for (const requestedDeposit of balances) {
    const { assetId, amount } = requestedDeposit;
    const [depositAlice, depositBob] = amount;
    // Perform the alice deposit
    if (constants.Zero.lt(depositAlice)) {
      await depositInChannel(
        setupChannel.channelAddress,
        aliceInfo.protocol,
        aliceInfo.signer,
        bobInfo.protocol,
        assetId,
        depositAlice,
      );
    }
    // Perform the bob deposit
    if (constants.Zero.lt(depositBob)) {
      await depositInChannel(
        setupChannel.channelAddress,
        bobInfo.protocol,
        bobInfo.signer,
        aliceInfo.protocol,
        assetId,
        depositBob,
      );
    }
  }
  const channel = await aliceInfo.protocol.getChannelState(setupChannel.channelAddress);
  expect(channel).to.be.ok;
  return {
    channel: channel!,
    alice: aliceInfo,
    bob: bobInfo,
  };
};
