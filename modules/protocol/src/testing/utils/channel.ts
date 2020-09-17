import { FullChannelState } from "@connext/vector-types";
import { Vector } from "src/vector";
import { env } from "./env";
import { expect } from "./expect";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const providerUrl = env.chainProviders[chainId];

export const setupChannel = async (alice: Vector, bob: Vector): Promise<FullChannelState<any>> => {
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
  return channel.getValue();
};
