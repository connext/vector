import { NodeParams } from "@connext/vector-types";

import { PrismaClient } from "../generated/db-client";
import { config } from "../config";

export const RouterUpdateStatus = {
  COMPLETE: "COMPLETE",
  FAILED: "FAILED",
  PENDING: "PENDING",
  PROCESSING: "PROCESSING",
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
export interface IRouterStore {
  getQueuedUpdates(channelAddress: string, status: RouterUpdateStatus): Promise<RouterStoredUpdate<RouterUpdateType>[]>;
  queueUpdate<T extends RouterUpdateType>(
    channelAddress: string,
    type: T,
    updateData: RouterStoredUpdatePayload[T],
    status?: RouterUpdateStatus,
  ): Promise<void>;
  setUpdateStatus(updateId: string, status: RouterUpdateStatus, context?: string): Promise<void>;
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
  }

  // Interface methods
  async getQueuedUpdates(
    channelAddress: string,
    status: RouterUpdateStatus,
  ): Promise<RouterStoredUpdate<RouterUpdateType>[]> {
    const updates = await this.prisma.queuedUpdate.findMany({ where: { channelAddress, status } });
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
}
