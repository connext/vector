import { VectorChainService } from "@connext/vector-contracts";
import { VectorEngine } from "@connext/vector-engine";
import { EngineEvents, ILockService, IVectorChainService, IVectorEngine } from "@connext/vector-types";
import { ChannelSigner, getBearerTokenFunction, NatsMessagingService } from "@connext/vector-utils";
import Axios from "axios";
import { Wallet } from "ethers";

import { logger, _providers, store } from "..";
import { config } from "../config";
import { LockService } from "../services/lock";

const ETH_STANDARD_PATH = "m/44'/60'/0'/0";

export function getLockService(publicIdentifier: string): ILockService | undefined {
  return nodes[publicIdentifier]?.lockService;
}

export function getPath(index = 0): string {
  return `${ETH_STANDARD_PATH}/${(String(index).match(/.{1,9}/gi) || [index]).join("/")}`;
}

export function getIndexFromPath(path: string): number {
  return Number(path.replace(ETH_STANDARD_PATH, "").replace("/", ""));
}

export const nodes: {
  [publicIdentifier: string]: {
    node: IVectorEngine;
    chainService: IVectorChainService;
    lockService: ILockService;
    index: number;
  };
} = {};

export const createNode = async (index: number): Promise<IVectorEngine> => {
  const method = "createNode";
  const pk = Wallet.fromMnemonic(config.mnemonic!, getPath(index)).privateKey;
  const signer = new ChannelSigner(pk);

  if (nodes[signer.publicIdentifier]) {
    return nodes[signer.publicIdentifier].node;
  }

  logger.info({ method, publicIdentifier: signer.publicIdentifier }, "Created ChannelSigner");

  const vectorTx = new VectorChainService(store, _providers, pk, logger.child({ module: "VectorChainService" }));
  logger.info({ method, providers: config.chainProviders }, "Connected VectorChainService");

  const messaging = new NatsMessagingService(
    {
      messagingUrl: config.natsUrl,
    },
    logger.child({ module: "NatsMessagingService" }),
    getBearerTokenFunction(signer, config.authUrl),
  );
  await messaging.connect();
  logger.info({ method, messagingUrl: config.natsUrl }, "Connected NatsMessagingService");

  const lockService = await LockService.connect(
    signer.publicIdentifier,
    messaging,
    config.redisUrl,
    logger.child({ module: "LockService" }),
  );
  logger.info({ method }, "Connected LockService");

  const vectorEngine = await VectorEngine.connect(
    messaging,
    lockService,
    store,
    signer,
    vectorTx,
    config.chainAddresses,
    logger.child({ module: "VectorEngine" }),
  );

  vectorEngine.on(EngineEvents.CONDITIONAL_TRANSFER_CREATED, async data => {
    const url = await store.getSubscription(EngineEvents.CONDITIONAL_TRANSFER_CREATED);
    if (url) {
      logger.info({ url, event: EngineEvents.CONDITIONAL_TRANSFER_CREATED }, "Relaying event");
      await Axios.post(url, data);
    }
  });

  vectorEngine.on(EngineEvents.CONDITIONAL_TRANSFER_RESOLVED, async data => {
    const url = await store.getSubscription(EngineEvents.CONDITIONAL_TRANSFER_RESOLVED);
    if (url) {
      logger.info({ url, event: EngineEvents.CONDITIONAL_TRANSFER_RESOLVED }, "Relaying event");
      await Axios.post(url, data);
    }
  });

  nodes[signer.publicIdentifier] = { node: vectorEngine, chainService: vectorTx, index, lockService };
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
