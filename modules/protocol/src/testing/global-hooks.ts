import {
  ChannelFactory,
  LinkedTransfer,
  ChannelMastercopy,
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
  const addresses = Array(3).fill(0).map(() => Wallet.createRandom().address);
  await fundAddress(addresses[0], ethProvider);
  await fundAddress(addresses[1], ethProvider);
  await fundAddress(addresses[2], ethProvider);
  await fundAddress(fundedAccount.address, ethProvider);
  global["wallet"] = fundedAccount;
}

export const mochaHooks = {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  async beforeAll() {
    await globalSetup();
  },
};
