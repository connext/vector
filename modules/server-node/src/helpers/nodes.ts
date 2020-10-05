import { VectorChainService } from "@connext/vector-contracts";
import { VectorEngine } from "@connext/vector-engine";
import { IVectorChainService, IVectorEngine } from "@connext/vector-types";
import { ChannelSigner } from "@connext/vector-utils";
import { Wallet } from "ethers";

import { logger, lock, _providers, store } from "..";
import { config } from "../config";
import { getBearerTokenFunction, NatsMessagingService } from "../services/messaging";

const ETH_STANDARD_PATH = "m/44'/60'/0'/0";

export function getPath(index = 0): string {
  return `${ETH_STANDARD_PATH}/${(String(index).match(/.{1,9}/gi) || [index]).join("/")}`;
}

export function getIndexFromPath(path: string): number {
  return Number(path.replace(ETH_STANDARD_PATH, "").replace("/", ""));
}

export const nodes: {
  [publicIdentifier: string]: { node: IVectorEngine; chainService: IVectorChainService; index: number };
} = {};

export const createNode = async (index: number): Promise<IVectorEngine> => {
  const pk = Wallet.fromMnemonic(config.mnemonic!, getPath(index)).privateKey;
  const signer = new ChannelSigner(pk);

  if (nodes[signer.publicIdentifier]) {
    return nodes[signer.publicIdentifier].node;
  }

  const vectorTx = new VectorChainService(_providers, pk, logger.child({ module: "VectorChainService" }));

  const messaging = new NatsMessagingService(
    {
      messagingUrl: config.natsUrl,
    },
    logger.child({ module: "NatsMessagingService" }),
    getBearerTokenFunction(signer),
  );
  await messaging.connect();

  const vectorEngine = await VectorEngine.connect(
    messaging,
    lock,
    store,
    signer,
    vectorTx,
    config.chainProviders,
    config.contractAddresses,
    logger.child({ module: "VectorEngine" }),
  );
  nodes[signer.publicIdentifier] = { node: vectorEngine, chainService: vectorTx, index };
  return vectorEngine;
};

export const getNode = (publicIdentifier: string): IVectorEngine | undefined => {
  return nodes[publicIdentifier].node;
};

export const getChainService = (publicIdentifier: string): IVectorChainService | undefined => {
  return nodes[publicIdentifier].chainService;
};

export const getNodes = (): { node: IVectorEngine; chainService: IVectorChainService; index: number }[] => {
  return Object.values(nodes);
};
