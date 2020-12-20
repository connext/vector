import { NodeParams } from "@connext/vector-types";

import { PrismaClient } from "../generated/db-client";
import { config } from "../config";

export const RouterUpdateStatus = {
  PENDING: "PENDING",
  COMPLETE: "COMPLETE",
  FAILED: "FAILED",
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
};
export interface IRouterStore {
  getQueuedUpdates(channelAddress: string, status: RouterUpdateStatus): Promise<RouterStoredUpdate<RouterUpdateType>[]>;
  queueUpdate<T extends RouterUpdateType>(
    channelAddress: string,
    type: T,
    updateData: RouterStoredUpdatePayload[T],
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

  async getQueuedUpdates(
    channelAddress: string,
    status: RouterUpdateStatus,
  ): Promise<RouterStoredUpdate<RouterUpdateType>[]> {
    const updates = await this.prisma.queuedUpdate.findMany({ where: { channelAddress, status } });
    return updates.map((u) => JSON.parse(u.updateData));
  }

  async queueUpdate<T extends RouterUpdateType>(
    channelAddress: string,
    type: T,
    updateData: RouterStoredUpdatePayload[T],
  ): Promise<void> {
    await this.prisma.queuedUpdate.create({
      data: {
        channelAddress,
        type,
        updateData: JSON.stringify(updateData),
        status: RouterUpdateStatus.PENDING,
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
