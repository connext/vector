import { GetConfigResponseBody, PostSetupRequestBody, PostSetupResponseBody } from "@connext/vector-types";

import { env } from "./env";
import { getServerNode, postServerNode } from "./http";

export const clearStore = async (nodeUrl: string): Promise<void> => {
  await postServerNode(nodeUrl, "clear-store", {
    adminToken: env.adminToken,
  });
};

export const getConfig = async (nodeUrl: string): Promise<GetConfigResponseBody> => {
  return getServerNode<GetConfigResponseBody>(nodeUrl, "config");
};

export const setupChannel = async (nodeUrl: string, params: PostSetupRequestBody): Promise<PostSetupResponseBody> => {
  return postServerNode<PostSetupRequestBody, PostSetupResponseBody>(nodeUrl, "setup", params);
};
