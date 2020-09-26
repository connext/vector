import { ServerNodeParams, ServerNodeResponses } from "@connext/vector-types";

import { env } from "./env";
import { getServerNode, postServerNode } from "./http";

export const clearStore = async (nodeUrl: string): Promise<void> => {
  await postServerNode(nodeUrl, "clear-store", {
    adminToken: env.adminToken,
  });
};

export const getConfig = async (nodeUrl: string): Promise<ServerNodeResponses.GetConfig> => {
  return getServerNode<ServerNodeResponses.GetConfig>(nodeUrl, "config");
};

export const getChannelState = async (
  nodeUrl: string,
  channelAddress: string,
): Promise<ServerNodeResponses.GetChannelState> => {
  return getServerNode<ServerNodeResponses.GetChannelState>(nodeUrl, `channel/${channelAddress}`);
};

export const getChannelStateByParticipants = async (
  nodeUrl: string,
  params: ServerNodeParams.GetChannelStateByParticipants,
): Promise<ServerNodeResponses.GetChannelState> => {
  return getServerNode<ServerNodeResponses.GetChannelState>(
    nodeUrl,
    `channel/${params.alice}/${params.bob}/${params.chainId}`,
  );
};

export const setupChannel = async (
  nodeUrl: string,
  params: ServerNodeParams.Setup,
): Promise<ServerNodeResponses.Setup> => {
  return postServerNode<ServerNodeParams.Setup, ServerNodeResponses.Setup>(nodeUrl, "setup", params);
};

export const sendDepositTx = async (
  nodeUrl: string,
  params: ServerNodeParams.SendDepositTx,
): Promise<ServerNodeResponses.SendDepositTx> => {
  return postServerNode<ServerNodeParams.SendDepositTx, ServerNodeResponses.SendDepositTx>(
    nodeUrl,
    "send-deposit-tx",
    params,
  );
};

export const reconcileDeposit = async (
  nodeUrl: string,
  params: ServerNodeParams.Deposit,
): Promise<ServerNodeResponses.Deposit> => {
  return postServerNode<ServerNodeParams.Deposit, ServerNodeResponses.Deposit>(nodeUrl, "deposit", params);
};
