import { ChannelFactory, TestToken, VectorChannel, VectorChainReader } from "@connext/vector-contracts";
import {
  FullChannelState,
  IChannelSigner,
  IMessagingService,
  IVectorProtocol,
  IVectorStore,
  IVectorChainReader,
  SetupParams,
  UpdateType,
  DEFAULT_CHANNEL_TIMEOUT,
} from "@connext/vector-types";
import {
  getRandomChannelSigner,
  getTestLoggers,
  expect,
  MemoryStoreService,
  MemoryMessagingService,
  getSignerAddressFromPublicIdentifier,
} from "@connext/vector-utils";
import { Contract } from "@ethersproject/contracts";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { AddressZero, HashZero, Zero } from "@ethersproject/constants";
import Pino from "pino";

import { env } from "../env";
import { chainId, provider } from "../constants";
import { Vector } from "../../vector";

import { fundAddress } from "./funding";

type VectorTestOverrides = {
  messagingService: IMessagingService;
  storeService: IVectorStore;
  signer: IChannelSigner;
  chainReader: IVectorChainReader;
  logger: Pino.BaseLogger;
};

// NOTE: when operating with three counterparties, they must
// all share a messaging service
const sharedMessaging = new MemoryMessagingService();
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
        const logger = instanceOverrides.logger ?? Pino();
        const chainReader = shareServices
          ? sharedChain
          : new VectorChainReader({ [chainId]: provider }, logger.child({ module: "VectorChainReader" }));

        const opts = {
          messagingService,
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

export const setupChannel = async (alice: IVectorProtocol, bob: IVectorProtocol): Promise<FullChannelState> => {
  const setupParams: SetupParams = {
    counterpartyIdentifier: bob.publicIdentifier,
    timeout: DEFAULT_CHANNEL_TIMEOUT.toString(),
    networkContext: {
      chainId,
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
    merkleRoot: HashZero,
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

export const deployChannelIfNeeded = async (
  channelAddress: string,
  bobAddr: string,
  aliceAddr: string,
  deployerSigner: IChannelSigner,
): Promise<void> => {
  const code = await deployerSigner.provider?.getCode(channelAddress);
  if (code !== "0x") {
    // already deployed to channel addr
    return;
  }
  const factory = new Contract(env.chainAddresses[chainId].channelFactoryAddress, ChannelFactory.abi, deployerSigner);
  const created = new Promise<string>((res) => {
    factory.once(factory.filters.ChannelCreation(), (data) => {
      res(data);
    });
  });
  const createTx = await factory.createChannel(aliceAddr, bobAddr);
  await createTx.wait();
  const deployedAddr = await created;
  expect(deployedAddr).to.equal(channelAddress);
};

export const depositOnchain = async (
  assetId: string,
  value: BigNumberish,
  channelAddress: string,
  aliceIdentifier: string,
  depositor: IChannelSigner,
): Promise<void> => {
  const isDepositA = aliceIdentifier === depositor.publicIdentifier;
  const multisig = new Contract(channelAddress, VectorChannel.abi, depositor);
  if (isDepositA) {
    // Call deposit on multisig
    // Approve tokens
    if (assetId !== AddressZero) {
      const approval = await new Contract(assetId, TestToken.abi, depositor).approve(channelAddress, value);
      await approval.wait();
    }
    const preDepositAliceBalance = await multisig.getTotalDepositsAlice(assetId);
    const tx = await multisig.depositAlice(assetId, value, {
      value: assetId === AddressZero ? value : BigNumber.from(0),
    });
    await tx.wait();
    const postDepositAliceBalance = await multisig.getTotalDepositsAlice(assetId);
    expect(postDepositAliceBalance).to.equal(preDepositAliceBalance.add(value));
    return;
  }
  const preDepositBobBalance = await multisig.getTotalDepositsBob(assetId);
  // Deposit onchain
  const tx =
    assetId === AddressZero
      ? await depositor.sendTransaction({ value, to: channelAddress })
      : await new Contract(assetId, TestToken.abi, depositor).transfer(channelAddress, value);
  await tx.wait();
  // Verify onchain values updated
  const postDepositBobBalance = await multisig.getTotalDepositsBob(assetId);
  expect(postDepositBobBalance).to.be.eq(preDepositBobBalance.add(value));
};

export const depositInChannel = async (
  channelAddress: string,
  depositor: IVectorProtocol,
  depositorSigner: IChannelSigner,
  counterparty: IVectorProtocol,
  assetId: string = AddressZero,
  amount?: BigNumberish,
): Promise<FullChannelState> => {
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
  await deployChannelIfNeeded(channelAddress, channel!.bob, channel!.alice, depositorSigner);

  // Deposit onchain
  await depositOnchain(assetId, value, channelAddress, channel!.aliceIdentifier, depositorSigner);

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
  const assetIdx = postDeposit!.assetIds.findIndex((a) => a === assetId);
  const aliceDeposit = depositorSigner.address === postDeposit.alice;
  // NOTE: at.least comparisons used to ensure additional deposits that
  // were not reconciled to use this utility
  if (aliceDeposit) {
    // bob didnt change
    expect(postDeposit.processedDepositsB[assetIdx]).to.be.eq(channel?.processedDepositsB[assetIdx] ?? "0");
    // alice increments by at least value
    expect(BigNumber.from(postDeposit.processedDepositsA[assetIdx]).toNumber()).to.be.at.least(
      value.add(channel?.processedDepositsA[assetIdx] ?? "0").toNumber(),
    );
  } else {
    // alice didnt change
    expect(postDeposit.processedDepositsA[assetIdx]).to.be.eq(channel?.processedDepositsA[assetIdx] ?? "0");
    // bob increments by at least value
    expect(BigNumber.from(postDeposit.processedDepositsB[assetIdx]).toNumber()).to.be.at.least(
      value.add(channel?.processedDepositsB[assetIdx] ?? "0").toNumber(),
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
  balances: { assetId: string; amount: [BigNumberish, BigNumberish] }[] = [{ assetId: AddressZero, amount: [100, 0] }],
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
    if (Zero.lt(depositAlice)) {
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
    if (Zero.lt(depositBob)) {
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
