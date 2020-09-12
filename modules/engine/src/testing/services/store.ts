import { FullChannelState, CoreTransferState, IEngineStore, TransferState } from "@connext/vector-types";

export class MemoryStoreService implements IEngineStore {
  connect(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  disconnect(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getChannelState(channelAddress: string): Promise<FullChannelState<any>> {
    throw new Error("Method not implemented.");
  }
  saveChannelState(channelState: FullChannelState<any>): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getActiveTransfers(channelAddress: string): Promise<CoreTransferState[]> {
    throw new Error("Method not implemented.");
  }
  getTransferState(transferId: string): Promise<TransferState | undefined> {
    throw new Error("Method not implemented.");
  }
}
