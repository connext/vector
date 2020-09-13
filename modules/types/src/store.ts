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
  // TODO: best interface?
  saveTransferToChannel(channelAddress: string, transfer: CoreTransferState, state: TransferState): Promise<void>;
  removeTransferFromChannel(channelAddress: string, transferId: string, state: TransferState): Promise<void>;

  getSchemaVersion(): Promise<number>;
  updateSchemaVersion(version?: number): Promise<void>;
}

export interface INodeCoreStore extends IEngineStore {}
