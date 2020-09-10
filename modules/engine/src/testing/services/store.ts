import { IStoreService, FullChannelState, CoreTransferState } from "@connext/vector-types";

export class MemoryStoreService implements IStoreService {
  getChannelState(channelAddress: string): Promise<FullChannelState<any>> {
    throw new Error("Method not implemented.");
  }
  saveChannelState(channelState: FullChannelState<any>): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getTransferInitialStates(channelAddress: string): Promise<CoreTransferState[]> {
    throw new Error("Method not implemented.");
  }
  getTransferState(transferId: string): Promise<CoreTransferState> {
    throw new Error("Method not implemented.");
  }
}
