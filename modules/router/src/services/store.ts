import { NodeParams } from "@connext/vector-types";

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
  getQueuedUpdates(
    channelAddress: string,
    status?: RouterUpdateStatus,
  ): Promise<RouterStoredUpdate<RouterUpdateType>[]>;
  queueUpdate<T extends RouterUpdateType>(
    channelAddress: string,
    type: T,
    updateData: RouterStoredUpdatePayload[T],
  ): Promise<void>;
  setUpdateStatus(updateId: string, status: RouterUpdateStatus, context?: string): Promise<void>;
}
export class RouterStore implements IRouterStore {
  async getQueuedUpdates(
    channelAddress: string,
    status?: RouterUpdateStatus,
  ): Promise<RouterStoredUpdate<RouterUpdateType>[]> {
    return [];
  }

  async queueUpdate<T extends RouterUpdateType>(
    channelAddress: string,
    type: T,
    updateData: RouterStoredUpdatePayload[T],
  ): Promise<void> {
    return;
  }

  async setUpdateStatus(updateId: string, status: RouterUpdateStatus, context?: string): Promise<void> {
    return;
  }
}
