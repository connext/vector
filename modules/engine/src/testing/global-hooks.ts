import {
  Adjudicator,
  ChannelFactory,
  LinkedTransfer,
  TransferDefinition,
  VectorChannel,
  Withdraw,
} from "@connext/vector-contracts";
import { Wallet, providers, utils, ContractFactory } from "ethers";
import { ContractAddresses, NetworkContext } from "@connext/vector-types";

const { parseEther } = utils;

const env = {
  chainProviders: JSON.parse(process.env.CHAIN_PROVIDERS ?? '{"1337":"http://localhost:8545"}'),
  logLevel: parseInt(process.env.LOG_LEVEL || "0", 10),
  sugarDaddy: process.env.SUGAR_DADDY || "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat",
};

const fundAddress = async (to: string, ethProvider: providers.JsonRpcProvider): Promise<void> => {
  const sugarDaddy = Wallet.fromMnemonic(env.sugarDaddy).connect(ethProvider);
  const tx = await sugarDaddy.sendTransaction({ to, value: parseEther("1000") });
  if (!tx.hash) throw new Error(`Couldn't fund account ${to}`);
  await ethProvider.waitForTransaction(tx.hash);
};

async function globalSetup(): Promise<void> {
  const [chainIdString, providerUrl] = Object.entries(env.chainProviders)[0] as [string, string];
  const ethProvider = new providers.JsonRpcProvider(providerUrl, parseInt(chainIdString));
  const fundedAccount = Wallet.createRandom().connect(ethProvider);
  const addresses = Array(3)
    .fill(0)
    .map((_v) => Wallet.createRandom().address);
  await fundAddress(addresses[0], ethProvider);
  await fundAddress(addresses[1], ethProvider);
  await fundAddress(addresses[2], ethProvider);
  await fundAddress(fundedAccount.address, ethProvider);
  const contractAddresses = await deployArtifactsToChain(fundedAccount);
  const context: NetworkContext = {
    ...contractAddresses,
    providerUrl,
    chainId: parseInt(chainIdString),
  };
  global["wallet"] = fundedAccount;
  global["networkContext"] = { ...context };
  console.log(`Done setting up global stuff`);
}

export const mochaHooks = {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  async beforeAll() {
    await globalSetup();
  },
};

const deployArtifactsToChain = async (wallet: Wallet): Promise<ContractAddresses> => {
  // Deploy core contracts
  const vectorChannelMastercopy = await new ContractFactory(VectorChannel.abi, VectorChannel.bytecode, wallet).deploy();

  const channelFactory = await new ContractFactory(ChannelFactory.abi, ChannelFactory.bytecode, wallet).deploy(
    vectorChannelMastercopy.address,
  );

  const adjudicator = await new ContractFactory(Adjudicator.abi, Adjudicator.bytecode, wallet).deploy();

  const transferDefinition = await new ContractFactory(
    TransferDefinition.abi,
    TransferDefinition.bytecode,
    wallet,
  ).deploy();

  // Deploy app contracts
  const linkedTransfer = await new ContractFactory(LinkedTransfer.abi, LinkedTransfer.bytecode, wallet).deploy();

  const withdraw = await new ContractFactory(Withdraw.abi, Withdraw.bytecode, wallet).deploy();

  return {
    channelFactoryAddress: channelFactory.address,
    vectorChannelMastercopyAddress: vectorChannelMastercopy.address,
    adjudicatorAddress: adjudicator.address,
    linkedTransferDefinition: linkedTransfer.address,
    withdrawDefinition: withdraw.address,
  };
};
