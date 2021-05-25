import { TestToken } from "@connext/vector-contracts";
import {
  DEFAULT_CHANNEL_TIMEOUT,
  EngineEvents,
  FullChannelState,
  INodeService,
  NodeError,
  TransferNames,
} from "@connext/vector-types";
import { createlockHash, delay, getRandomBytes32, RestServerNodeService } from "@connext/vector-utils";
import { BigNumber, constants, Contract, providers, Wallet, utils } from "ethers";
import { formatEther, parseUnits } from "ethers/lib/utils";
import PriorityQueue from "p-queue";

import { env, getRandomIndex } from "../../utils";

import { config } from "./config";
import { logger } from "./setupServer";

const chainId = parseInt(Object.keys(env.chainProviders)[0]);
const provider = new providers.JsonRpcProvider(env.chainProviders[chainId]);
const wallet = Wallet.fromMnemonic(env.sugarDaddy).connect(provider);
const transferAmount = "1"; //utils.parseEther("0.00001").toString();
const agentBalance = utils.parseEther("0.0005").toString();
const routerBalance = utils.parseEther("0.15");

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
  logger.info({ assetId, value: formatEther(target), address }, "Funding address");
  await fundAddress(address, assetId, diff);
};

const fundAddress = async (address: string, assetId: string, value: BigNumber): Promise<void> => {
  // Make sure wallet has sufficient funds to deposit
  const maxBalance = await (assetId === constants.AddressZero
    ? provider.getBalance(wallet.address)
    : new Contract(assetId, TestToken.abi, wallet).balanceOf(wallet.address));

  if (maxBalance.lt(value)) {
    throw new Error(
      `${wallet.address} has insufficient balance (${utils.formatEther(
        maxBalance,
      )}) of ${assetId} to deposit ${utils.formatEther(value)}`,
    );
  }

  // Send funds to address using queue
  const tx = await walletQueue.add(async () => {
    logger.debug({ address, assetId, value: formatEther(value) }, "Funding onchain");
    const gasPrice = (await provider.getGasPrice()).add(parseUnits("20", "wei"));
    const nonce = await wallet.getTransactionCount();
    logger.info({ nonce: nonce.toString() }, "Sending at nonce");
    const request: providers.TransactionResponse =
      assetId === constants.AddressZero
        ? await wallet.sendTransaction({ to: address, value, gasPrice, nonce })
        : await new Contract(assetId, TestToken.abi, wallet).transfer(address, value, { gasPrice, nonce });
    logger.info({ nonce: request.nonce?.toString() }, "Sent");
    return request;
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
    if (nodeRes == undefined) {
      throw Error("Node res undefined");
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
    preImage: string = getRandomBytes32(),
    routingId: string = getRandomBytes32(),
  ): Promise<{ channelAddress: string; transferId: string; routingId: string; preImage: string; start: number }> {
    this.assertChannel();
    // Create the transfer information
    const lockHash = createlockHash(preImage);

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
    logger.info({ ...createRes.getValue() }, "Created transfer");
    return { ...createRes.getValue(), preImage, routingId, start: Date.now() };
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

    const assetIdx = channel.assetIds.findIndex((a) => a === assetId);
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
    logger.info({ assetId, value: formatEther(value), channelAddress: this.channelAddress }, "Funding channel");
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
      counterparty: this.rogerIdentifier,
      chainId,
    });
    if (channelRes.isError) {
      throw channelRes.getError()!;
    }
    return channelRes.getValue()! as FullChannelState;
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

    if (error && error.message !== "Channel not found") {
      // Unknown error, do not setup
      throw error;
    }
    // Setup the channel, did not exist previously
    const setup = await this.nodeService.setup({
      counterpartyIdentifier: this.rogerIdentifier,
      chainId,
      timeout: DEFAULT_CHANNEL_TIMEOUT.toString(),
      publicIdentifier: this.publicIdentifier,
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

type TransferInformation = {
  preImage: string;
  start: number;
  end?: number;
  error?: string;
};
export class AgentManager {
  public readonly transferInfo: {
    [routingId: string]: TransferInformation;
  } = {};

  private constructor(
    public readonly roger: string,
    public readonly routerIdentifier: string,
    public readonly routerService: INodeService,
    public readonly agents: Agent[] = [],
    public readonly agentService: INodeService,
  ) {}

  static async connect(
    agentService: RestServerNodeService,
    enableAutomaticResolution: boolean = true,
  ): Promise<AgentManager> {
    // First, create + fund roger onchain
    logger.debug({ url: env.rogerUrl });
    const routerService = await RestServerNodeService.connect(
      env.rogerUrl,
      logger.child({ module: "Router" }),
      undefined,
      0,
    );
    const routerConfig = await routerService.getConfig();
    if (routerConfig.isError) {
      throw routerConfig.getError()!;
    }
    const { signerAddress: router, publicIdentifier: routerIdentifier } = routerConfig.getValue()[0];

    // Fund roger
    await fundAddressToTarget(router, constants.AddressZero, routerBalance);

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
      indices = registeredAgents.slice(0, config.numAgents).map((r) => r.index);
    } else {
      // Must create more agents
      const toCreate = config.numAgents - registeredAgents.length;
      indices = registeredAgents.map((r) => r.index).concat(Array(toCreate).fill(0).map(getRandomIndex));
      // indices = Array(config.numAgents).fill(0).map(getRandomIndex);
    }

    let agents: Agent[] = [];
    for (const i of indices) {
      const agent = await Agent.connect(agentService, routerIdentifier, i);
      agents.push(agent);
    }
    // const agents = await Promise.all(indices.map((i) => Agent.connect(agentService, routerIdentifier, i)));

    // Create the manager
    const manager = new AgentManager(router, routerIdentifier, routerService, agents, agentService);

    // Automatically resolve any created transfers
    if (enableAutomaticResolution) {
      manager.setupAutomaticResolve();
    }

    return manager;
  }

  private setupAutomaticResolve(): void {
    this.agents.map((agent) => {
      const ret = this.agentService.on(
        EngineEvents.CONDITIONAL_TRANSFER_CREATED,
        async (data) => {
          logger.debug({ ...data, agent: agent.publicIdentifier }, "Got conditional transfer created event");

          const {
            channelAddress,
            transfer: { meta, initiator, transferId },
          } = data;
          const { routingId } = meta ?? {};
          // Make sure there is a routingID
          if (!routingId) {
            logger.warn({ ...(meta ?? {}) }, "No routingID");
            return;
          }
          if (agent.channelAddress !== channelAddress) {
            logger.error(
              { agent: agent.channelAddress, channelAddress },
              "Agent does not match data, should not happen!",
            );
            process.exit(1);
          }

          if (agent.signerAddress === initiator) {
            // Agent is initiator, nothing to resolve
            logger.debug({ transfer: transferId, agent: agent.signerAddress }, "Agent is initiator, doing nothing");
            return;
          }

          // Creation comes from router forwarding, agent is responder
          // Find the preImage
          const { preImage } = this.transferInfo[routingId] ?? {};
          if (!preImage) {
            logger.error(
              {
                channelAddress,
                transferId,
                routingId,
                transferInfo: this.transferInfo,
                preImage,
              },
              "No preImage",
            );
            process.exit(1);
          }

          // Resolve the transfer
          try {
            logger.debug({ agent: agent.signerAddress, preImage, transfer: transferId }, "Resolving transfer");
            await agent.resolveHashlockTransfer(transferId, preImage);
            logger.info({ transferId, channelAddress, agent: agent.publicIdentifier }, "Resolved transfer");
          } catch (e) {
            logger.error(
              { transferId, channelAddress, agent: agent.publicIdentifier, error: e.message },
              "Failed to resolve transfer",
            );
            process.exit(1);
          }

          return ret;
        },
        (data) => this.agents.map((a) => a.channelAddress).includes(data.channelAddress),
        agent.publicIdentifier,
      );
    });
  }

  // Should return function to kill cyclical transfers
  async startCyclicalTransfers(): Promise<() => Promise<void>> {
    // Register listener that will resolve transfers once it is
    // created
    this.agents.map((_agent) => {
      this.agentService.on(
        EngineEvents.CONDITIONAL_TRANSFER_RESOLVED,
        async (data) => {
          logger.debug(
            { transferId: data.transfer.transferId, channelAddress: data.channelAddress },
            "Caught conditional transfer resolved event",
          );
          // Create a new transfer to a random agent
          const { channelAddress, transfer } = data;

          // Find the agent from the recipient in routing meta
          const { routingId } = transfer.meta;
          // Make sure there is a routingID
          if (!routingId) {
            logger.debug({}, "No routingId");
            return;
          }

          // Add timestamp on resolution
          this.transferInfo[routingId].end = Date.now();

          // If it was cancelled, mark as failure
          if (Object.values(data.transfer.transferResolver)[0] === constants.HashZero) {
            logger.warn(
              {
                transferId: transfer.transferId,
                channelAddress,
                cancellationReason: transfer.meta.cancellationReason,
              },
              "Transfer cancelled",
            );
            this.transferInfo[routingId].error = transfer.meta.cancellationReason ?? "Cancelled";
          }

          const agent = this.agents.find((a) => a.channelAddress && a.channelAddress === data.channelAddress);
          if (!agent) {
            logger.error(
              { channelAddress, agents: this.agents.map((a) => a.channelAddress).join(",") },
              "No agent found to resolve",
            );
            process.exit(1);
          }

          // Only create a new transfer IFF you resolved it
          if (agent.signerAddress === transfer.initiator) {
            logger.debug(
              {
                transfer: transfer.transferId,
                initiator: transfer.initiator,
                responder: transfer.responder,
                agent: agent.signerAddress,
              },
              "Agent is initiator, doing nothing",
            );
            return;
          }

          // Create new transfer to continue cycle
          const receiver = this.getRandomAgent(agent);
          try {
            const { preImage, routingId, transferId, start } = await agent.createHashlockTransfer(
              receiver.publicIdentifier,
              constants.AddressZero,
            );
            this.transferInfo[routingId] = { ...(this.transferInfo[routingId] ?? {}), preImage, start };
            logger.info(
              { transferId, channelAddress, receiver: receiver.publicIdentifier, routingId },
              "Created transfer",
            );
          } catch (e) {
            logger.error(
              { error: e.message, agent: agent.publicIdentifier, channelAddress },
              "Failed to create new transfer",
            );
            process.exit(1);
          }
        },
        (data) => {
          const channels = this.agents.map((a) => a.channelAddress);
          return channels.includes(data.channelAddress);
        },
        _agent.publicIdentifier,
      );
    });

    // Create some transfers to start cycle
    logger.info({ agents: this.agents.length, config: { ...config } }, "Starting transfers");
    const sender = this.getRandomAgent();
    for (const agent of this.agents) {
      if (agent.publicIdentifier === sender.publicIdentifier) {
        logger.debug({}, "Is sender, skipping");
        continue;
      }
      const { preImage, routingId, start } = await sender.createHashlockTransfer(
        agent.publicIdentifier,
        constants.AddressZero,
      );
      this.transferInfo[routingId] = { ...(this.transferInfo[routingId] ?? {}), preImage, start };
    }

    const kill = () =>
      new Promise<void>(async (resolve, reject) => {
        try {
          this.agentService.off(EngineEvents.CONDITIONAL_TRANSFER_CREATED);
          this.agentService.off(EngineEvents.CONDITIONAL_TRANSFER_RESOLVED);
          // Wait just in case
          await delay(5_000);

          this.printTransferSummary();

          resolve();
        } catch (e) {
          reject(e.message);
        }
      });

    return kill;
  }

  // Creates multiple transfers in a single channel
  async createMultipleTransfersWithSameParties(): Promise<() => Promise<void>> {
    // Create some transfers to start cycle
    logger.info({ agents: this.agents.length, config: { ...config } }, "Starting transfer creation");
    const agent = this.getRandomAgent();
    const recipient = this.getRandomAgent(agent);

    const transfers: { transferId: string; elapsed: number }[] = [];

    this.agentService.on(
      EngineEvents.CONDITIONAL_TRANSFER_CREATED,
      async (data) => {
        // Create a new transfer
        const start = Date.now();
        const { transferId } = await agent.createHashlockTransfer(recipient.publicIdentifier, constants.AddressZero);
        transfers.push({ transferId, elapsed: Date.now() - start });
      },
      (data) => data.bobIdentifier === agent.publicIdentifier,
      agent.publicIdentifier,
    );

    const start = Date.now();
    const { transferId } = await agent.createHashlockTransfer(recipient.publicIdentifier, constants.AddressZero);
    transfers.push({ transferId, elapsed: Date.now() - start });

    const kill = () =>
      new Promise<void>(async (resolve, reject) => {
        try {
          this.agentService.off(EngineEvents.CONDITIONAL_TRANSFER_CREATED);
          // Wait just in case
          await delay(5_000);

          // print summary of transfers created
          const number = transfers.length;
          const first = transfers[0].elapsed;
          const last = transfers[transfers.length - 1].elapsed;
          const toLog = transfers
            .map((info, idx) => {
              if (idx % 20 === 0) {
                return { active: idx, elapsed: info.elapsed };
              }
              return undefined;
            })
            .filter((x) => !!x);

          logger.warn(
            { transfers: number, latestElapsed: last, firstElapsed: first, intermittent: toLog },
            "Transfer summary",
          );
          resolve();
        } catch (e) {
          reject(e.message);
        }
      });

    return kill;
  }

  public printTransferSummary(): void {
    const times = Object.entries(this.transferInfo)
      .map(([routingId, transfer]) => {
        if (!transfer.end) {
          return undefined;
        }
        return transfer.end - transfer.start;
      })
      .filter((x) => !!x) as number[];
    const total = times.reduce((a, b) => a + b);
    const average = total / times.length;
    const longest = times.sort((a, b) => b - a)[0];
    const shortest = times.sort((a, b) => a - b)[0];
    const errored = Object.entries(this.transferInfo)
      .map(([routingId, transfer]) => {
        if (transfer.error) {
          return transfer.error;
        }
        return undefined;
      })
      .filter((x) => !!x);
    logger.info(
      {
        errors: errored,
        average,
        longest,
        shortest,
        completed: times.length,
        agents: this.agents.length,
        cancelled: errored.length,
      },
      "Transfer summary",
    );
  }

  public getRandomAgent(excluding?: Agent): Agent {
    const filtered = excluding
      ? this.agents.filter((n) => n.publicIdentifier !== excluding.publicIdentifier)
      : [...this.agents];
    if (filtered.length === 0) {
      logger.error(
        { node: excluding, agents: this.agents.map((n) => n.publicIdentifier).join(",") },
        "Could not get random counterparty",
      );
      throw new Error("Failed to get counterparty");
    }
    return filtered[Math.floor(Math.random() * filtered.length)];
  }
}
