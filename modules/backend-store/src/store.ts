import { IStoreService, FullChannelState, CoreTransferState } from "@connext/vector-types";
import { PrismaClient } from "@prisma/client";

export class Store implements IStoreService {
  private prisma: PrismaClient;
  constructor() {
    this.prisma = new PrismaClient({
      datasources: {
        my_database: {
          provider: "sqlite",
          url: "file::memory:",
        },
      },
    });
  }

  getChannelState(channelAddress: string): Promise<FullChannelState<any> | undefined> {
    throw new Error("Method not implemented.");
  }

  saveChannelState(channelState: FullChannelState<any>): Promise<void> {
    throw new Error("Method not implemented.");
  }

  getTransferInitialStates(channelAddress: string): Promise<CoreTransferState[]> {
    throw new Error("Method not implemented.");
  }

  getTransferState(transferId: string): Promise<CoreTransferState | undefined> {
    throw new Error("Method not implemented.");
  }
}
