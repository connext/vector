import { FullChannelState, ChannelCommitmentData, FullTransferState } from "./channel";

export interface IVectorStore {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getChannelStates(): Promise<FullChannelState[]>;
  getChannelState(channelAddress: string): Promise<FullChannelState | undefined>;
  getChannelStateByParticipants(
    participantA: string,
    participantB: string,
    chainId: number,
  ): Promise<FullChannelState | undefined>;
  getChannelCommitment(channelAddress: string): Promise<ChannelCommitmentData | undefined>;
  saveChannelState(
    channelState: FullChannelState,
    commitment: ChannelCommitmentData,
    transfer?: FullTransferState,
  ): Promise<void>;

  // Should return all initial transfer state data needed to
  // create the merkle root
  getActiveTransfers(channelAddress: string): Promise<FullTransferState[]>;
  getTransferState(transferId: string): Promise<FullTransferState | undefined>;

  getSchemaVersion(): Promise<number | undefined>;
  updateSchemaVersion(version?: number): Promise<void>;
}
