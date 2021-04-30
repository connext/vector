import { NodeParams, AllowedSwap } from "@connext/vector-types";

import { PrismaClient } from "../generated/db-client";
import { getConfig } from "../config";

const config = getConfig();

export const RouterUpdateStatus = {
  COMPLETE: "COMPLETE",
  FAILED: "FAILED",
  PENDING: "PENDING",
  UNVERIFIED: "UNVERIFIED",
} as const;
export type RouterUpdateStatus = keyof typeof RouterUpdateStatus;

export const RouterUpdateType = {
  TRANSFER_CREATION: "TRANSFER_CREATION",
  TRANSFER_RESOLUTION: "TRANSFER_RESOLUTION",
} as const;
export type RouterUpdateType = keyof typeof RouterUpdateType;

export type RouterStoredUpdatePayload = {
  [RouterUpdateType.TRANSFER_CREATION]: NodeParams.ConditionalTransfer;
  [RouterUpdateType.TRANSFER_RESOLUTION]: NodeParams.ResolveTransfer;
};

export type RouterStoredUpdate<T extends RouterUpdateType> = {
  id: string;
  type: T;
  payload: RouterStoredUpdatePayload[T];
  status: RouterUpdateStatus;
};

export const RouterRebalanceStatus = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  EXECUTED: "EXECUTED",
  COMPLETE: "COMPLETE",
  FINISHED: "FINISHED",
} as const;
export type RouterRebalanceStatus = keyof typeof RouterRebalanceStatus;

export type RouterRebalanceRecord = {
  id: string;
  swap: AllowedSwap;
  status: RouterRebalanceStatus;
  approveHash?: string;
  approveChain?: number;
  executeHash?: string;
  executeChain?: number;
  completeHash?: string;
  completeChain?: number;
  // createdAt
  // updatedAt
};
export interface IRouterStore {
  // QueuedUpdates store methods.
  getQueuedUpdates(
    channelAddress: string,
    statuses: RouterUpdateStatus[],
  ): Promise<RouterStoredUpdate<RouterUpdateType>[]>;
  queueUpdate<T extends RouterUpdateType>(
    channelAddress: string,
    type: T,
    updateData: RouterStoredUpdatePayload[T],
    status?: RouterUpdateStatus,
  ): Promise<void>;
  setUpdateStatus(updateId: string, status: RouterUpdateStatus, context?: string): Promise<void>;
  getLatestRebalance(swap: AllowedSwap): Promise<RouterRebalanceRecord | undefined>;
  saveRebalance(record: RouterRebalanceRecord): Promise<void>;
}
export class PrismaStore implements IRouterStore {
  public prisma: PrismaClient;

  constructor(private readonly dbUrl?: string) {
    const _dbUrl = this.dbUrl
      ? this.dbUrl
      : config.dbUrl?.startsWith("sqlite")
      ? `${config.dbUrl}?connection_limit=1&socket_timeout=10`
      : config.dbUrl;

    this.prisma = new PrismaClient(_dbUrl ? { datasources: { db: { url: _dbUrl } } } : undefined);
  }

  // Store management methods
  connect(): Promise<void> {
    return Promise.resolve();
  }

  async disconnect(): Promise<void> {
    await this.prisma.$disconnect();
  }

  async clear(): Promise<void> {
    await this.prisma.queuedUpdate.deleteMany({});
    await this.prisma.autoRebalance.deleteMany({});
  }

  // Interface methods
  async getQueuedUpdates(
    channelAddress: string,
    statuses: RouterUpdateStatus[],
  ): Promise<RouterStoredUpdate<RouterUpdateType>[]> {
    const updates = await this.prisma.queuedUpdate.findMany({ where: { channelAddress, status: { in: statuses } } });
    return updates.map((u) => {
      return {
        payload: JSON.parse(u.updateData),
        type: u.type as RouterUpdateType,
        status: u.status as RouterUpdateStatus,
        id: u.id,
      };
    });
  }

  async queueUpdate<T extends RouterUpdateType>(
    channelAddress: string,
    type: T,
    updateData: RouterStoredUpdatePayload[T],
    status: RouterUpdateStatus = RouterUpdateStatus.PENDING,
  ): Promise<void> {
    await this.prisma.queuedUpdate.create({
      data: {
        channelAddress,
        type,
        updateData: JSON.stringify(updateData),
        status,
      },
    });
  }

  async setUpdateStatus(updateId: string, status: RouterUpdateStatus, context?: string): Promise<void> {
    await this.prisma.queuedUpdate.update({
      where: { id: updateId },
      data: {
        status,
        context,
      },
    });
  }

  // Do we need the orderBy / findFirst ? According to schema, the query should result in only
  // 1 unique entry being returned (if found).
  async getLatestRebalance(swap: AllowedSwap): Promise<RouterRebalanceRecord | undefined> {
    const result = await this.prisma.autoRebalance.findFirst({
      orderBy: [
        {
          updatedAt: "desc",
        },
      ],
      where: {
        fromAssetId: swap.fromAssetId.toString(),
        toAssetId: swap.toAssetId.toString(),
        fromChainId: swap.fromChainId.toString(),
        toChainId: swap.toChainId.toString(),
      },
    });
    return result
      ? {
          id: result.id,
          swap: swap,
          status: result.status as RouterRebalanceStatus,
          approveHash: result.approveHash ? result.approveHash : undefined,
          approveChain: result.approveChain ? parseInt(result.approveChain) : undefined,
          executeHash: result.executeHash ? result.executeHash : undefined,
          executeChain: result.executeChain ? parseInt(result.executeChain) : undefined,
          completeHash: result.completeHash ? result.completeHash : undefined,
          completeChain: result.completeChain ? parseInt(result.completeChain) : undefined,
        }
      : undefined;
  }

  async saveRebalance(record: RouterRebalanceRecord): Promise<void> {
    await this.prisma.autoRebalance.upsert({
      where: {
        id: record.id,
      },
      update: {
        // Getting current time to mark 'updatedAt' time.
        updatedAt: new Date(Date.now()),
        // Core data updates:
        status: record.status,
        approveHash: record.approveHash,
        executeHash: record.executeHash,
        completeHash: record.completeHash,
      },
      create: {
        id: record.id,
        status: record.status,
        approveHash: record.approveHash,
        approveChain: record.approveChain?.toString(),
        executeHash: record.executeHash,
        executeChain: record.executeChain?.toString(),
        completeHash: record.completeHash,
        completeChain: record.completeChain?.toString(),
        fromChainId: record.swap.fromChainId.toString(),
        toChainId: record.swap.toChainId.toString(),
        fromAssetId: record.swap.fromAssetId.toString(),
        toAssetId: record.swap.toAssetId.toString(),
        priceType: record.swap.priceType.toString(),
        hardcodedRate: record.swap.hardcodedRate,
        rebalancerUrl: record.swap.rebalancerUrl,
        rebalanceThresholdPct: record.swap.rebalanceThresholdPct,
        percentageFee: record.swap.percentageFee,
        flatFee: record.swap.flatFee,
        gasSubsidyPercentage: record.swap.gasSubsidyPercentage,
      },
    });
  }
}
