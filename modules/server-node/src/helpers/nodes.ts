import { VectorChainService } from "@connext/vector-contracts";
import { VectorEngine } from "@connext/vector-engine";
import { EngineEvents, ILockService, IVectorChainService, IVectorEngine, IServerNodeStore } from "@connext/vector-types";
import { ChannelSigner, NatsMessagingService, logAxiosError } from "@connext/vector-utils";
import Axios from "axios";
import { Wallet } from "@ethersproject/wallet";

import { logger, _providers } from "../index";
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

export let nodes: {
  [publicIdentifier: string]: {
    node: IVectorEngine;
    chainService: IVectorChainService;
    lockService: ILockService;
    index: number;
  };
} = {};

export const deleteNodes = async (store: IServerNodeStore): Promise<void> => {
  nodes = {};
  await store.removeNodeIndexes();
};

export const createNode = async (
  index: number,
  store: IServerNodeStore,
  mnemonic: string,
  skipCheckIn: boolean,
): Promise<IVectorEngine> => {
  const method = "createNode";
  const pk = Wallet.fromMnemonic(mnemonic, getPath(index)).privateKey;
  const signer = new ChannelSigner(pk);

  if (nodes[signer.publicIdentifier]) {
    return nodes[signer.publicIdentifier].node;
  }

  logger.info({ method, publicIdentifier: signer.publicIdentifier }, "Created ChannelSigner");

  const vectorTx = new VectorChainService(store, _providers, pk, logger.child({ module: "VectorChainService" }));
  logger.info({ method, providers: config.chainProviders }, "Connected VectorChainService");

  const messaging = new NatsMessagingService({
    logger: logger.child({ module: "NatsMessagingService" }),
    messagingUrl: config.messagingUrl,
    natsUrl: config.natsUrl,
    authUrl: config.authUrl,
    signer,
  });
  await messaging.connect();
  logger.info({ method, messagingUrl: config.messagingUrl }, "Connected NatsMessagingService");

  const lockService = await LockService.connect(
    signer.publicIdentifier,
    messaging,
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
    skipCheckIn,
    config.baseGasSubsidyPercentage,
    undefined,
  );

  for (const event of Object.values(EngineEvents)) {
    vectorEngine.on(event, async (data) => {
      const url = await store.getSubscription(vectorEngine.publicIdentifier, event);
      if (url) {
        logger.info({ url, event }, "Sending event to listener");
        try {
          const response = await Axios.post(url, data);
          logger.info({ url, event, response: response.data }, "Successfully relayed event");
        } catch (error) {
          logAxiosError(logger, error, { event, url }, "Error sending event to listener");
        }
      }
    });
    logger.info({ event, method, publicIdentifier: signer.publicIdentifier, index }, "Set up subscription for event");
  }

  nodes[signer.publicIdentifier] = { node: vectorEngine, chainService: vectorTx, index, lockService };
  store.setNodeIndex(index, signer.publicIdentifier);
  return vectorEngine;
};

export const getNode = (publicIdentifier: string): IVectorEngine | undefined => {
  return nodes[publicIdentifier]?.node;
};

export const getChainService = (publicIdentifier: string): IVectorChainService | undefined => {
  return nodes[publicIdentifier].chainService;
};

export const getNodes = (): { node: IVectorEngine; chainService: IVectorChainService; index: number }[] => {
  return Object.values(nodes);
};
