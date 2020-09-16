import { FullChannelState, CoreTransferState, ChannelCommitmentData, TransferCommitmentData } from "./channel";
import { TransferResolver, TransferState } from "./transferDefinitions";

export type TransferRecord = { transferId: string } & Partial<{
  initialState: TransferState;
  commitment: TransferCommitmentData;
  resolver: TransferResolver;
  meta: any;
}>;

export interface IVectorStore {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getChannelState(channelAddress: string): Promise<FullChannelState | undefined>;
  getChannelCommitment(channelAddress: string): Promise<ChannelCommitmentData | undefined>;
  saveChannelState(
    channelState: FullChannelState,
    commitment: ChannelCommitmentData,
    transferRecord?: TransferRecord,
  ): Promise<void>;
  // getChannelStateByCounterparty(counterpartyIdentifier: string): Promise<FullChannelState | undefined>;

  // Should return all initial transfer state data needed to
  // create the merkle root
  getActiveTransfers(channelAddress: string): Promise<CoreTransferState[]>;
  getCoreTransferState(transferId: string): Promise<CoreTransferState | undefined>;
  getTransferState(transferId: string): Promise<TransferState | undefined>;

  getSchemaVersion(): Promise<number | undefined>;
  updateSchemaVersion(version?: number): Promise<void>;
}
