import { FullChannelState, CoreTransferState } from "./channel";
import { TransferState } from "./transferDefinitions";

export interface IEngineStore {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getChannelState(channelAddress: string): Promise<FullChannelState | undefined>;
  saveChannelState(channelState: FullChannelState): Promise<void>;

  // Should return all initial transfer state data needed to
  // create the merkle root
  getActiveTransfers(channelAddress: string): Promise<CoreTransferState[]>;
  getCoreTransferState(transferId: string): Promise<CoreTransferState | undefined>;
  getTransferState(transferId: string): Promise<TransferState | undefined>;
}

export interface INodeCoreStore extends IEngineStore {}
