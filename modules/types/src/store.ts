import { FullChannelState, CoreTransferState, TransferState } from "./channel";

export interface IStoreService {
  getChannelState(channelAddress: string): Promise<FullChannelState | undefined>;
  saveChannelState(channelState: FullChannelState): Promise<void>;

  // Should return all initial transfer state data needed to
  // create the merkle root
  getTransferInitialStates(channelAddress: string): Promise<CoreTransferState[]>;
  getTransferState(transferId: string): Promise<TransferState | undefined>;
}
