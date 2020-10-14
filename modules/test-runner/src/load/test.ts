import { EngineEvents, ServerNodeResponses, TransferNames } from "@connext/vector-types";
import { createlockHash, getRandomBytes32, RestServerNodeService } from "@connext/vector-utils";
import { BigNumber, constants, providers, utils, Wallet } from "ethers";
import { parseEther } from "ethers/lib/utils";

import { env, getRandomIndex } from "../utils";

import { config } from "./config";

import { carolEvts, logger } from "./index";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const provider = new providers.JsonRpcProvider(env.chainProviders[chainId]);
const wallet = Wallet.fromMnemonic(env.sugarDaddy).connect(provider);
const assetId = constants.AddressZero;
const transferAmount = utils.parseEther("0.0001").toString();

const preImages: {
  [routingId: string]: string;
} = {};

const channelAddresses: {
  [publicIdentifier: string]: string;
} = {};

const createNodes = async (
  nodes: ServerNodeResponses.GetConfig,
  nodeService: RestServerNodeService,
): Promise<ServerNodeResponses.GetConfig> => {
  let ret = [...nodes];
  if (nodes.length < config.numAgents) {
    const agentsToCreate = config.numAgents - nodes.length;
    for (let i = 0; i < agentsToCreate; i++) {
      const nodeRes = await nodeService.createNode({ index: getRandomIndex() });
      if (nodeRes.isError) {
        logger.error({ error: nodeRes.getError() }, "Could not create node");
        process.exit(1);
      }
      ret.push(nodeRes.getValue());
    }
  } else if (nodes.length > config.numAgents) {
    ret = nodes.slice(0, config.numAgents);
  }
  return ret;
};

const fundAddress = async (addr: string, minimumBalance: BigNumber = parseEther("1")) => {
  const balance = await provider.getBalance(addr);
  if (balance.gte(minimumBalance)) {
    return;
  }

  const depositAmt = minimumBalance.mul(10);
  const tx = await wallet.sendTransaction({ value: depositAmt, to: addr });
  await tx.wait();
};

const createRoger = async () => {
  // Fund and create roger
  const rogerService = await RestServerNodeService.connect(
    env.rogerUrl,
    logger.child({ module: "RestServerNodeService" }),
  );
  const rogerConfig = await rogerService.createNode({ index: 0 });
  if (rogerConfig.isError) {
    logger.error({ error: rogerConfig.getError() }, "Failed to setup roger node");
    process.exit(1);
  }
  const { signerAddress: roger, publicIdentifier: rogerIdentifier } = rogerConfig.getValue();
  await fundAddress(roger);
  return { rogerService, roger, rogerIdentifier };
};

export const getRandomNode = (nodes: ServerNodeResponses.GetConfig, excluding: string) => {
  const filtered = nodes.filter(n => n.publicIdentifier !== excluding);
  if (filtered.length === 0) {
    logger.error(
      { node: excluding, nodes: nodes.map(n => n.publicIdentifier).join(",") },
      "Could not get random counterparty",
    );
    process.exit(1);
  }
  return filtered[Math.floor(Math.random() * filtered.length)];
};

const getOrSetupChannel = async (
  rogerIdentifier: string,
  nodeIdentifier: string,
  nodeService: RestServerNodeService,
): Promise<string> => {
  // Try to get the channel
  const channelRes = await nodeService.getStateChannelByParticipants({
    publicIdentifier: nodeIdentifier,
    alice: rogerIdentifier,
    bob: nodeIdentifier,
    chainId,
  });
  const error = channelRes.getError();
  if (!error) {
    // Channel has already been setup, set + return channel address
    const { channelAddress } = channelRes.getValue();
    logger.debug({ channelAddress }, "Retrieved channel");
    channelAddresses[nodeIdentifier] = channelAddress;
    return channelAddress;
  }

  if (error && !error.context.error.includes("404")) {
    // Unknown error, do not setup
    logger.error({ ...error, node: nodeIdentifier }, "Failed to get channel");
    process.exit(1);
  }

  // Setup the channel
  const setup = await nodeService.requestSetup({
    aliceUrl: env.rogerUrl,
    chainId,
    timeout: "360000",
    aliceIdentifier: rogerIdentifier,
    bobIdentifier: nodeIdentifier,
  });
  if (setup.isError) {
    logger.error({ error: setup.getError() }, "Could not set up");
    process.exit(1);
  }
  const { channelAddress } = setup.getValue();
  logger.debug({ channelAddress }, "Setup channel");
  channelAddresses[nodeIdentifier] = channelAddress;
  return channelAddress;
};

export const createAndPrepNodes = async (rogerIdentifier: string, nodeService: RestServerNodeService) => {
  // First, get all nodes that are active on the server
  const initialNodes = await nodeService.getConfig();
  if (initialNodes.isError) {
    logger.error({ error: initialNodes.getError() }, "Failed to get config");
    process.exit(1);
  }

  // Prune or add to nodes on server to make sure it matches
  // test config
  const nodesForTest = await createNodes(initialNodes.getValue(), nodeService);

  // First, setup the channel if needed
  for (const node of nodesForTest) {
    logger.info({ ...node }, "Beginning node setup");

    // Get or setup channel
    const channelAddress = await getOrSetupChannel(rogerIdentifier, node.publicIdentifier, nodeService);

    // Fund the channel with eth if needed
    await fundAddress(channelAddress, parseEther("0.2"));

    // Reconcile the deposit
    const deposit = await nodeService.reconcileDeposit({
      assetId,
      channelAddress: channelAddress,
      publicIdentifier: node.publicIdentifier,
    });
    if (deposit.isError) {
      logger.error({ error: deposit.getError() }, "Could not reconcile deposit");
      process.exit(1);
    }
    logger.debug({ ...deposit.getValue() }, "Reconciled deposit");

    // Setup the listeners for the node
    // Should try to resolve if a transfer was created
    await nodeService.on(
      EngineEvents.CONDITIONAL_TRANSFER_CREATED,
      async data => {
        logger.debug({ node: node.publicIdentifier, type: data.conditionType }, "Got conditional transfer created");
        const { channelAddress, transfer } = data;

        // Make sure there is a routingID
        if (!transfer.meta.routingId) {
          logger.error({ transfer: transfer.transferId, channelAddress, node: node.publicIdentifier }, "No routing id");
          return;
        }

        // If we are the initiator, do not resolve
        if (transfer.initiator === node.signerAddress) {
          logger.debug(
            { transfer: transfer.transferId, channelAddresses, node: node.publicIdentifier },
            "We are initiator, doing nothing",
          );
          return;
        }

        // Get the preImage
        const preImage = preImages[transfer.meta.routingId];
        if (!preImage) {
          logger.error({ preImage, routingId: data.transfer.meta.routingId }, "preImage not available for transfer");
          process.exit(1);
        }

        // Try to resolve the transfer
        const resolveRes = await nodeService.resolveTransfer({
          publicIdentifier: node.publicIdentifier,
          channelAddress,
          transferResolver: { preImage },
          transferId: transfer.transferId,
        });
        if (resolveRes.isError) {
          logger.error({ error: resolveRes.getError() }, "Could not resolve transfer");
          process.exit(1);
        }
        logger.info({ ...resolveRes.getValue() }, "Resolved transfer");
      },
      data => data.channelAddress === channelAddresses[node.publicIdentifier],
    );

    // Should try to create another transfer if *they* have resolved a transfer
    await nodeService.on(
      EngineEvents.CONDITIONAL_TRANSFER_RESOLVED,
      async data => {
        logger.debug({ node: node.publicIdentifier, type: data.conditionType }, "Got conditional transfer resolved");
        const { channelAddress, transfer } = data;

        // Make sure there is a routingID
        if (!transfer.meta.routingId) {
          logger.error({ transfer: transfer.transferId, channelAddress, node: node.publicIdentifier }, "No routing id");
          return;
        }

        // If we are the initiator, do not create a new transfer
        if (transfer.initiator === node.signerAddress) {
          logger.debug(
            { transfer: transfer.transferId, channelAddress, node: node.publicIdentifier },
            "We are initiator, doing nothing",
          );
          return;
        }

        // Create transfer
        await createTransfer(node, nodesForTest, nodeService);
      },
      data => data.channelAddress === channelAddresses[node.publicIdentifier],
    );

    logger.info({ channelAddress, node: node.publicIdentifier }, "Node setup successfully");
  }

  return nodesForTest;
};

export const createTransfer = async (
  sender: { publicIdentifier: string; index: number; signerAddress: string },
  testNodes: ServerNodeResponses.GetConfig,
  nodeService: RestServerNodeService,
): Promise<ServerNodeResponses.ConditionalTransfer> => {
  // Create the transfer information
  const preImage = getRandomBytes32();
  const lockHash = createlockHash(preImage);
  const routingId = getRandomBytes32();
  const receiver = getRandomNode(testNodes, sender.publicIdentifier);
  const channelAddress = channelAddresses[sender.publicIdentifier];
  if (!channelAddress) {
    logger.error({ channelAddresses, node: sender.publicIdentifier }, "No channel address");
    process.exit(1);
  }

  // Save preimage
  preImages[routingId] = preImage;

  // Create transfer
  logger.info(
    { reciever: receiver.publicIdentifier, sender: sender.publicIdentifier, preImage, routingId },
    "Creating transfer",
  );
  const createRes = await nodeService.conditionalTransfer({
    publicIdentifier: sender.publicIdentifier,
    channelAddress,
    amount: transferAmount.toString(),
    assetId,
    recipient: receiver.publicIdentifier,
    type: TransferNames.HashlockTransfer,
    details: { lockHash, expiry: "0" },
    meta: { routingId },
  });
  if (createRes.isError) {
    logger.error({ error: createRes.getError() }, "Could not create transfer");
    process.exit(1);
  }
  logger.info({ ...createRes.getValue() }, "Created transfer");
  return createRes.getValue();
};

export const test = async (): Promise<void> => {
  const { rogerIdentifier } = await createRoger();

  const restApiClient = await RestServerNodeService.connect(
    env.carolUrl,
    logger.child({ module: "RestServerNodeService" }),
    carolEvts,
  );
  logger.info({ rogerIdentifier, agents: config.numAgents }, "Creating agents");
  const nodes = await createAndPrepNodes(rogerIdentifier, restApiClient);
  logger.info({ agents: nodes.map(n => n.publicIdentifier) }, "Agents created, starting test");

  const sender = nodes.pop();
  if (!sender) {
    logger.error({ nodes: nodes.map(n => n.publicIdentifier).join(",") }, "Could not find sender");
    process.exit(1);
  }

  for (const _ of nodes) {
    // Create a transfer to a random counterparty for each node
    // Listeners should mean that each responder will try to
    // create a new transfer
    await createTransfer(sender, nodes, restApiClient);
  }
};
