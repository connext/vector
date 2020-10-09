import { EngineEvents, ServerNodeResponses, TransferNames } from "@connext/vector-types";
import { getRandomBytes32, RestServerNodeService } from "@connext/vector-utils";
import { constants, providers, utils, Wallet } from "ethers";

import { env, getRandomIndex } from "../utils";

import { config } from "./config";

import { carolEvts, logger } from "./index";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const wallet = Wallet.fromMnemonic(env.sugarDaddy).connect(new providers.JsonRpcProvider(env.chainProviders[chainId]));
const assetId = constants.AddressZero;
const transferAmount = utils.parseEther("0.0001").toString();

type Nodes = {
  publicIdentifier: string;
  signerAddress: string;
  index: number;
};

const preImages: {
  [routingId: string]: string;
} = {};

const channelAddresses: {
  [publicIdentifier: string]: string;
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

const prepNodes = async (nodes: ServerNodeResponses.GetConfig, node: RestServerNodeService) => {
  const getRandomCounterparty = () => {
    const filteredNodes = nodes.filter(n => {
      return n.publicIdentifier !== node.publicIdentifier;
    });
    const random = Math.floor(Math.random() * filteredNodes.length);
    return filteredNodes[random];
  };
  for (const n of nodes) {
    logger.info({ node: n }, "Setting up node");
    const roger = await RestServerNodeService.connect(env.rogerUrl, logger.child({ module: "RestServerNodeService" }));
    const channel = await node.getStateChannelByParticipants({
      alice: roger.publicIdentifier,
      bob: n.publicIdentifier,
      chainId,
    });

    let channelAddress;

    if (channel.isError) {
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
      channelAddress = setup.getValue().channelAddress;
    } else {
      // Channel already exists, don't need to setup
      channelAddress = channel.getValue().channelAddress;
    }

    channelAddresses[node.publicIdentifier] = channelAddress;
    const tx = await wallet.sendTransaction({ to: channelAddress, value: utils.parseEther("0.5") });
    await tx.wait();

    const deposit = await node.reconcileDeposit({
      assetId,
      channelAddress: channelAddress,
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
      },
      data => data.channelAddress === channelAddress && data.transfer.responder === node.signerAddress,
    );

    node.on(
      EngineEvents.CONDITIONAL_TRANSFER_RESOLVED,
      async data => {
        const preImage = getRandomBytes32();
        const lockHash = utils.soliditySha256(["bytes32"], [preImage]);
        const routingId = getRandomBytes32();
        preImages[routingId] = preImage;
        const counterparty = getRandomCounterparty();

        logger.info({ counterparty }, "Creating transfer");

        const create = await node.conditionalTransfer({
          channelAddress: data.channelAddress,
          amount: transferAmount,
          assetId,
          recipient: counterparty.publicIdentifier,
          type: TransferNames.HashlockTransfer,
          meta: {
            routingId,
          },
          details: {
            lockHash,
            expiry: "0",
          },
        });

        if (create.isError) {
          logger.error({ error: create.getError() }, "Could not create transfer");
          process.exit(1);
        }
        logger.info({ res: create.getValue() }, "Created transfer");
      },
      data => data.channelAddress === channelAddress && data.transfer.responder === node.signerAddress,
    );
  }
};

export const test = async (): Promise<void> => {
  const carol = await RestServerNodeService.connect(
    env.carolUrl,
    logger.child({ module: "RestServerNodeService" }),
    carolEvts,
  );
  const carolNodesRes = await carol.getConfig();
  let carolNodes = carolNodesRes.getValue();
  carolNodes = await createNodes(carolNodes, carol);
  await prepNodes(carolNodes, carol);

  const sender = carolNodes.pop();

  for (const node of carolNodes) {
    const createPreImage = getRandomBytes32();
    const lockHash = utils.soliditySha256(["bytes32"], [createPreImage]);
    const routingId = getRandomBytes32();
    preImages[routingId] = createPreImage;
    const channelAddress = channelAddresses[node.publicIdentifier];

    logger.info("=================== Creating conditionl transfer");
    const create = await carol.conditionalTransfer({
      channelAddress,
      amount: transferAmount,
      assetId,
      recipient: node.publicIdentifier,
      type: TransferNames.HashlockTransfer,
      meta: {
        routingId,
      },
      details: {
        lockHash,
        expiry: "0",
      },
    });
    logger.info("======================= Created conditional transfer");

    if (create.isError) {
      logger.error({ error: create.getError() }, "Could not create transfer");
      process.exit(1);
    }
    logger.info({ res: create.getValue() }, "Created transfer");
  }
};
