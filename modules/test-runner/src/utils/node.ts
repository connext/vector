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

export const setupChannel = async (
  nodeUrl: string,
  params: ServerNodeParams.Setup,
): Promise<ServerNodeResponses.Setup> => {
  return postServerNode<ServerNodeParams.Setup, ServerNodeResponses.Setup>(nodeUrl, "setup", params);
};
