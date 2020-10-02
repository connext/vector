import { VectorChainService } from "@connext/vector-contracts";
import { VectorEngine } from "@connext/vector-engine";
import { IVectorEngine } from "@connext/vector-types";
import { ChannelSigner } from "@connext/vector-utils";
import { Wallet } from "ethers";

import { logger, lock, _providers, store } from "..";
import { config } from "../config";
import { getBearerTokenFunction, NatsMessagingService } from "../services/messaging";

export const nodes: { [path: string]: IVectorEngine } = {};

export const createNode = async (index: string): Promise<IVectorEngine> => {
  if (nodes[index]) {
    return nodes[index];
  }

  const pk = Wallet.fromMnemonic(config.mnemonic!).privateKey;
  const signer = new ChannelSigner(pk);

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
  nodes[index] = vectorEngine;
  return vectorEngine;
};
