import { TestToken } from "@connext/vector-contracts";
import { EngineEvents, FullChannelState, INodeService, NodeError, TransferNames } from "@connext/vector-types";
import { createlockHash, delay, getRandomBytes32, RestServerNodeService } from "@connext/vector-utils";
import { BigNumber, constants, Contract, providers, Wallet, utils } from "ethers";
import { formatEther, parseEther } from "ethers/lib/utils";
import PriorityQueue from "p-queue";

import { env, getRandomIndex } from "../utils";

import { config } from "./config";

import { logger } from "./index";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const provider = new providers.JsonRpcProvider(env.chainProviders[chainId]);
const wallet = Wallet.fromMnemonic(env.sugarDaddy).connect(provider);
const transferAmount = utils.parseEther("0.00001").toString();
const agentBalance = utils.parseEther("5").toString();

const walletQueue = new PriorityQueue({ concurrency: 1 });

const fundAddressToTarget = async (address: string, assetId: string, target: BigNumber): Promise<void> => {
  const balance = await (assetId === constants.AddressZero
    ? provider.getBalance(address)
    : new Contract(assetId, TestToken.abi, wallet).balanceOf(address));
  if (balance.gte(target)) {
    logger.debug(
      { balance: formatEther(balance), target: formatEther(target), assetId },
      "Balance is greater than target, doing nothing",
    );
    // Nothing to deposit, return
    return;
  }

  const diff = target.sub(balance);
  await fundAddress(address, assetId, diff);
};

const fundAddress = async (address: string, assetId: string, value: BigNumber): Promise<void> => {
  // Make sure wallet has sufficient funds to deposit
  const sugarDaddy = await (assetId === constants.AddressZero
    ? provider.getBalance(wallet.address)
    : new Contract(assetId, TestToken.abi, wallet).balanceOf(wallet.address));

  if (sugarDaddy.lt(value)) {
    throw new Error(
      `Insufficient balance (${utils.formatEther(sugarDaddy)}) of ${assetId} to deposit ${utils.formatEther(value)}`,
    );
  }

  // Send funds to address using queue
  const tx = await walletQueue.add(() => {
    logger.debug({ address, assetId, value: formatEther(value) }, "Funding onchain");
    return assetId === constants.AddressZero
      ? wallet.sendTransaction({ to: address, value })
      : new Contract(assetId, TestToken.abi, wallet).transfer(address, value);
  });

  logger.debug({ hash: tx.hash, assetId, value: utils.formatEther(value) }, "Submitted deposit to chain");
  await tx.wait();

  const balance = await (assetId === constants.AddressZero
    ? provider.getBalance(address)
    : new Contract(assetId, TestToken.abi, wallet).balanceOf(address));

  logger.debug({ newBalance: formatEther(balance), address, assetId }, "Successfully funded");
};

// This class manages a single channel connected to roger.
// Many agents will be used throughout the test, and are
// managed cohesively in the `AgentContainer` class
export class Agent {
  public channelAddress: string | undefined = undefined;

  private constructor(
    public readonly publicIdentifier: string,
    public readonly signerAddress: string,
    public readonly index: number,
    private readonly rogerIdentifier: string,
    private readonly nodeService: INodeService,
  ) {}

  static async connect(
    nodeService: INodeService,
    rogerIdentifier: string,
    index: number = getRandomIndex(),
    minimumChannelBalance: { assetId: string; amount: BigNumber } = {
      assetId: constants.AddressZero,
      amount: BigNumber.from(agentBalance),
    },
  ): Promise<Agent> {
    // Create node on server at idx
    // NOTE: can safely be called multiple times
    const nodeRes = await nodeService.createNode({ index });
    if (nodeRes.isError) {
      throw nodeRes.getError()!;
    }
    const { publicIdentifier, signerAddress } = nodeRes.getValue();

    // Create the agent
    const agent = new Agent(publicIdentifier, signerAddress, index, rogerIdentifier, nodeService);

    // Get or setup the channel with the agent
    await agent.setupChannel();

    // Make sure there are sufficient funds in channel
    await agent.fundChannelToTarget(minimumChannelBalance.assetId, minimumChannelBalance.amount);

    return agent;
  }

  async createHashlockTransfer(
    recipient: string,
    assetId: string,
  ): Promise<{ channelAddress: string; transferId: string; routingId: string; preImage: string }> {
    this.assertChannel();
    // Create the transfer information
    const preImage = getRandomBytes32();
    const lockHash = createlockHash(preImage);
    const routingId = getRandomBytes32();

    // Create transfer
    logger.debug({ recipient, sender: this.publicIdentifier, preImage, routingId }, "Creating transfer");
    const createRes = await this.nodeService.conditionalTransfer({
      publicIdentifier: this.publicIdentifier,
      channelAddress: this.channelAddress!,
      amount: transferAmount.toString(),
      assetId,
      recipient,
      type: TransferNames.HashlockTransfer,
      details: { lockHash, expiry: "0" },
      meta: { routingId },
    });
    if (createRes.isError) {
      throw createRes.getError()!;
    }
    logger.debug({ ...createRes.getValue() }, "Created transfer");
    return { ...createRes.getValue(), preImage, routingId };
  }

  async resolveHashlockTransfer(
    transferId: string,
    preImage: string,
  ): Promise<{ channelAddress: string; transferId: string; routingId?: string; preImage: string }> {
    this.assertChannel();
    // Try to resolve the transfer
    const resolveRes = await this.nodeService.resolveTransfer({
      publicIdentifier: this.publicIdentifier,
      channelAddress: this.channelAddress!,
      transferResolver: { preImage },
      transferId,
    });
    if (resolveRes.isError) {
      throw resolveRes.getError()!;
    }
    logger.debug({ ...resolveRes.getValue() }, "Resolved transfer");
    return { ...resolveRes.getValue()!, preImage };
  }

  async fundChannelToTarget(assetId: string, target: BigNumber): Promise<void> {
    this.assertChannel();

    // Get the channel to see if you need to deposit
    const channel = await this.getChannel();

    const assetIdx = channel.assetIds.findIndex(a => a === assetId);
    const balance = BigNumber.from(assetIdx === -1 ? "0" : channel.balances[assetIdx].amount[1]);
    if (balance.gte(target)) {
      // Nothing to deposit, return
      return;
    }

    const diff = target.sub(balance);

    await this.fundChannel(assetId, diff);
  }

  async fundChannel(assetId: string, value: BigNumber): Promise<void> {
    this.assertChannel();

    // Fund channel onchain
    await fundAddress(this.channelAddress!, assetId, value);

    // Reconcile deposit
    const deposit = await this.nodeService.reconcileDeposit({
      assetId,
      channelAddress: this.channelAddress!,
      publicIdentifier: this.publicIdentifier,
    });
    if (deposit.isError) {
      throw deposit.getError()!;
    }
    logger.debug({ ...deposit.getValue() }, "Reconciled deposit");
  }

  async getChannel(): Promise<FullChannelState> {
    // Try to get the channel
    const channelRes = await this.nodeService.getStateChannelByParticipants({
      publicIdentifier: this.publicIdentifier,
      alice: this.rogerIdentifier,
      bob: this.publicIdentifier,
      chainId,
    });
    if (channelRes.isError) {
      throw channelRes.getError()!;
    }
    return channelRes.getValue();
  }

  private async setupChannel(): Promise<string> {
    // Try to get the channel
    let error: NodeError | undefined = undefined;
    try {
      const channel = await this.getChannel();
      // no error, exists, set + return channel addr
      this.channelAddress = channel.channelAddress;
      return channel.channelAddress;
    } catch (e) {
      error = e;
    }

    if (error && !error.context.error.includes("404")) {
      // Unknown error, do not setup
      throw error!;
    }

    // Setup the channel, did not exist previously
    const setup = await this.nodeService.requestSetup({
      aliceUrl: env.rogerUrl,
      chainId,
      timeout: "360000",
      aliceIdentifier: this.rogerIdentifier,
      bobIdentifier: this.publicIdentifier,
    });
    if (setup.isError) {
      throw setup.getError()!;
    }
    const { channelAddress } = setup.getValue();
    logger.debug({ channelAddress }, "Setup channel");
    this.channelAddress = channelAddress;
    return channelAddress;
  }

  private assertChannel() {
    // Ensure channel has been setup
    if (!this.channelAddress) {
      throw new Error(`No channel setup for ${this.signerAddress}`);
    }
  }
}

// This class manages multiple agents within the context of a test
export class AgentManager {
  public readonly preImages: {
    [routingId: string]: string;
  } = {};

  private constructor(
    public readonly roger: string,
    public readonly rogerIdentifier: string,
    public readonly rogerService: INodeService,
    public readonly agents: Agent[] = [],
    public readonly agentService: INodeService,
  ) {}

  static async connect(agentService: RestServerNodeService): Promise<AgentManager> {
    // First, create + fund roger onchain
    const rogerService = await RestServerNodeService.connect(
      env.rogerUrl,
      logger.child({ module: "RestServerNodeService" }),
    );
    const rogerConfig = await rogerService.createNode({ index: 0 });
    if (rogerConfig.isError) {
      throw rogerConfig.getError()!;
    }
    const { signerAddress: roger, publicIdentifier: rogerIdentifier } = rogerConfig.getValue();

    // Fund roger
    await fundAddressToTarget(roger, constants.AddressZero, parseEther("50"));

    // Create all agents needed
    // First, get all nodes that are active on the server
    const initialAgents = await agentService.getConfig();
    if (initialAgents.isError) {
      throw initialAgents.getError()!;
    }
    const registeredAgents = initialAgents.getValue();

    let indices: number[] = [];
    if (registeredAgents.length > config.numAgents) {
      // Too many agents already registered on service
      // only use a portion of the registered agents
      indices = registeredAgents.slice(0, config.numAgents).map(r => r.index);
    } else {
      // Must create more agents
      const toCreate = config.numAgents - registeredAgents.length;
      indices = registeredAgents
        .map(r => r.index)
        .concat(
          Array(toCreate)
            .fill(0)
            .map(getRandomIndex),
        );
    }

    // NOTE: because connecting agents *may* send a tx, you cannot
    // use `Promise.all` without the nonce of the tx being messed up
    const agents = await Promise.all(indices.map(i => Agent.connect(agentService, rogerIdentifier, i)));

    // Create the manager
    const manager = new AgentManager(roger, rogerIdentifier, rogerService, agents, agentService);

    // Automatically resolve any created transfers
    await manager.setupAutomaticResolve();

    return manager;
  }

  private async setupAutomaticResolve(): Promise<void> {
    await this.agentService.on(
      EngineEvents.CONDITIONAL_TRANSFER_CREATED,
      async data => {
        logger.debug({ ...data }, "Got conditional transfer created event");
        // First find the agent with the proper channel address
        const { channelAddress, transfer } = data;

        // Find the agent from the recipient in routing meta
        const { routingId } = transfer.meta;
        // Make sure there is a routingID
        if (!routingId) {
          logger.warn({}, "No routingID");
          return;
        }

        const agent = this.agents.find(a => a.channelAddress && a.channelAddress === data.channelAddress);
        if (!agent) {
          logger.error(
            { channelAddress, agents: this.agents.map(a => a.channelAddress).join(",") },
            "No agent found to resolve",
          );
          process.exit(1);
        }

        if (agent.signerAddress === transfer.initiator) {
          // Agent is initiator, nothing to resolve
          logger.debug(
            { transfer: transfer.transferId, agent: agent.signerAddress },
            "Agent is initiator, doing nothing",
          );
          return;
        }

        // Creation comes from router forwarding, agent is responder
        // Find the preImage
        const preImage = this.preImages[routingId];
        if (!preImage) {
          logger.error(
            { channelAddress, transferId: transfer.transferId, routingId, preImages: JSON.stringify(this.preImages) },
            "No preImage",
          );
          process.exit(1);
        }

        // Resolve the transfer
        try {
          logger.debug({ agent: agent.signerAddress, preImage, transfer: transfer.transferId }, "Resolving transfer");
          await agent.resolveHashlockTransfer(transfer.transferId, preImage);
          logger.info(
            { transferId: transfer.transferId, channelAddress, agent: agent.publicIdentifier },
            "Resolved transfer",
          );
        } catch (e) {
          logger.error(
            { transferId: transfer.transferId, channelAddress, agent: agent.publicIdentifier, error: e.message },
            "Failed to resolve transfer",
          );
          process.exit(1);
        }
      },
      data => this.agents.map(a => a.channelAddress).includes(data.channelAddress),
    );
  }

  // Should return function to kill cyclical transfers
  async startCyclicalTransfers(): Promise<() => Promise<void>> {
    // Register listener that will resolve transfers once it is
    // created
    await this.agentService.on(
      EngineEvents.CONDITIONAL_TRANSFER_RESOLVED,
      async data => {
        // Create a new transfer to a random agent
        const { channelAddress, transfer } = data;

        // Find the agent from the recipient in routing meta
        const { routingId } = transfer.meta;
        // Make sure there is a routingID
        if (!routingId) {
          logger.debug({}, "No routingId");
          return;
        }

        // Remove the preimage on resolution
        delete this.preImages[routingId];

        const agent = this.agents.find(a => a.channelAddress && a.channelAddress === data.channelAddress);
        if (!agent) {
          logger.error(
            { channelAddress, agents: this.agents.map(a => a.channelAddress).join(",") },
            "No agent found to resolve",
          );
          process.exit(1);
        }

        // Only create a new transfer IFF you resolved it
        if (agent.signerAddress === transfer.initiator) {
          logger.debug(
            { transfer: transfer.transferId, agent: agent.signerAddress },
            "Agent is initiator, doing nothing",
          );
          return;
        }

        // Create new transfer to continue cycle
        const receiver = this.getRandomAgent(agent);
        try {
          const { preImage, routingId } = await agent.createHashlockTransfer(
            receiver.publicIdentifier,
            constants.AddressZero,
          );
          this.preImages[routingId] = preImage;
        } catch (e) {
          logger.error(
            { error: e.message, agent: agent.publicIdentifier, channelAddress },
            "Failed to create new transfer",
          );
          process.exit(1);
        }
      },
      data => this.agents.map(a => a.channelAddress).includes(data.channelAddress),
    );

    // Create some transfers to start cycle
    logger.info({ agents: this.agents.length, config: { ...config } }, "Starting transfers");
    const sender = this.getRandomAgent();
    for (const agent of this.agents) {
      if (agent.publicIdentifier === sender.publicIdentifier) {
        logger.debug({}, "Is sender, skipping");
        continue;
      }
      const { preImage, routingId } = await sender.createHashlockTransfer(
        agent.publicIdentifier,
        constants.AddressZero,
      );
      this.preImages[routingId] = preImage;
    }

    const kill = () =>
      new Promise<void>(async (resolve, reject) => {
        try {
          await this.agentService.off(EngineEvents.CONDITIONAL_TRANSFER_CREATED);
          await this.agentService.off(EngineEvents.CONDITIONAL_TRANSFER_RESOLVED);
          // Wait just in case
          await delay(5000);
          resolve();
        } catch (e) {
          reject(e.message);
        }
      });

    return kill;
  }

  public getRandomAgent(excluding?: Agent): Agent {
    const filtered = excluding
      ? this.agents.filter(n => n.publicIdentifier !== excluding.publicIdentifier)
      : [...this.agents];
    if (filtered.length === 0) {
      logger.error(
        { node: excluding, agents: this.agents.map(n => n.publicIdentifier).join(",") },
        "Could not get random counterparty",
      );
      throw new Error("Failed to get counterparty");
    }
    return filtered[Math.floor(Math.random() * filtered.length)];
  }
}
