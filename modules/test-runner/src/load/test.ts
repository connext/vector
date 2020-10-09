import { EngineEvents, ServerNodeResponses } from "@connext/vector-types";
import { RestServerNodeService } from "@connext/vector-utils";
import { constants, providers, utils, Wallet } from "ethers";

import { env, getRandomIndex } from "../utils";

import { config } from "./config";

import { logger } from "./index";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const wallet = Wallet.fromMnemonic(env.sugarDaddy).connect(new providers.JsonRpcProvider(env.chainProviders[chainId]));
const assetId = constants.AddressZero;

type Nodes = {
  publicIdentifier: string;
  signerAddress: string;
  index: number;
};

const preImages: {
  [routingId: string]: string;
} = {};

const createNodes = async (
  nodes: ServerNodeResponses.GetConfig,
  node: RestServerNodeService,
): Promise<ServerNodeResponses.GetConfig> => {
  if (nodes.length < config.numAgents) {
    const agentsToCreate = config.numAgents - nodes.length;
    for (let i = 0; i < agentsToCreate; i++) {
      const nodeRes = await node.createNode({ index: getRandomIndex() });
      if (nodeRes.isError) {
        logger.error({ error: nodeRes.getError() }, "Could not create node");
        process.exit(1);
      }
      nodes.push(nodeRes.getValue());
    }
  } else if (nodes.length > config.numAgents) {
    nodes = nodes.slice(0, config.numAgents);
  }
  return nodes;
};

const prepNodes = async (
  nodes: ServerNodeResponses.GetConfig,
  node: RestServerNodeService,
  counterpartyNodes: ServerNodeResponses.GetConfig,
) => {
  const getRandomCounterparty = () => {
    const random = Math.floor(Math.random() * counterpartyNodes.length);
    return counterpartyNodes[random];
  };
  for (const n of nodes) {
    logger.info({ node: n }, "Setting up node");
    const setup = await node.requestSetup({
      aliceUrl: env.rogerUrl,
      chainId,
      timeout: "360000",
      bobIdentifier: n.publicIdentifier,
    });
    if (setup.isError) {
      logger.error({ error: setup.getError() }, "Could not set up");
      process.exit(1);
    }
    logger.info({ res: setup.getValue() }, "Setup node");

    const tx = await wallet.sendTransaction({ to: setup.getValue().channelAddress, value: utils.parseEther("0.5") });
    await tx.wait();

    const deposit = await node.reconcileDeposit({
      assetId,
      channelAddress: setup.getValue().channelAddress,
      publicIdentifier: n.publicIdentifier,
    });
    if (deposit.isError) {
      logger.error({ error: deposit.getError() }, "Could not reconcile deposit");
      process.exit(1);
    }
    logger.info({ res: deposit.getValue() }, "Reconciled deposit");

    node.on(
      EngineEvents.CONDITIONAL_TRANSFER_CREATED,
      async data => {
        const preImage = preImages[data.transfer.meta.routingId];
        if (!preImage) {
          logger.error({ preImage, routingId: data.transfer.meta.routingId }, "preImage not available for transfer");
          process.exit(1);
        }

        const resolve = await node.resolveTransfer({
          channelAddress: data.channelAddress,
          transferId: data.transfer.transferId,
          transferResolver: { preImage },
          publicIdentifier: n.publicIdentifier,
        });
        if (resolve.isError) {
          logger.error({ error: resolve.getError() }, "Could not resolve transfer");
          process.exit(1);
        }
        logger.info({ res: resolve.getValue() }, "Resolved transfer");

        const counterparty = getRandomCounterparty();

        logger.info({ counterparty }, "Resolved transfer");
      },
      data => data.channelAddress === setup.getValue().channelAddress,
    );
  }
};

export const test = async (): Promise<void> => {
  const carol = await RestServerNodeService.connect(env.carolUrl, logger.child({ module: "RestServerNodeService" }));
  const carolNodesRes = await carol.getConfig();
  let carolNodes = carolNodesRes.getValue();
  carolNodes = await createNodes(carolNodes, carol);

  const dave = await RestServerNodeService.connect(env.daveUrl, logger.child({ module: "RestServerNodeService" }));
  const daveNodesRes = await dave.getConfig();
  let daveNodes = daveNodesRes.getValue();
  daveNodes = await createNodes(daveNodes, dave);

  for (const node of carolNodes) {
  }
};
