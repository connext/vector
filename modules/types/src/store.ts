import { FullChannelState, CoreTransferState } from "./channel";
import { TransferState } from "./transferDefinitions";

export interface IStoreService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getChannelState(channelAddress: string): Promise<FullChannelState | undefined>;
  saveChannelState(channelState: FullChannelState): Promise<void>;

  // Should return all initial transfer state data needed to
  // create the merkle root
  getActiveTransfers(channelAddress: string): Promise<CoreTransferState[]>;
  getTransferState(transferId: string): Promise<TransferState | undefined>;
}
