import { IStoreService, FullChannelState, CoreTransferState } from "@connext/vector-types";

export class Store implements IStoreService {
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
