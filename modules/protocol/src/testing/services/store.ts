import {
  FullChannelState,
  CoreTransferState,
  IVectorStore,
  TransferState,
  ChannelCommitmentData,
  TransferRecord,
} from "@connext/vector-types";

export class MemoryStoreService implements IVectorStore {
  // Map<channelAddress, transferId[]>
  private transfersInChannel: Map<string, string[]> = new Map();

  // Map<transferId, transferState>
  private transfers: Map<string, TransferRecord> = new Map();

  // Map<channelAddress, channelState>
  private channelStates: Map<string, { state: FullChannelState; commitment: ChannelCommitmentData }> = new Map();

  private schemaVersion: number | undefined = undefined;

  getCoreTransferState(transferId: string): Promise<CoreTransferState | undefined> {
    return Promise.resolve(this.transfers.get(transferId)?.commitment?.state);
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  getChannelState(channelAddress: string): Promise<FullChannelState<any> | undefined> {
    const { state } = this.channelStates.get(channelAddress) ?? {};
    return Promise.resolve(state);
  }

  getChannelStates(): Promise<FullChannelState[]> {
    return Promise.resolve([...this.channelStates.values()].map(c => c.state));
  }

  saveChannelState(
    channelState: FullChannelState,
    commitment: ChannelCommitmentData,
    transferRecord?: TransferRecord,
  ): Promise<void> {
    this.channelStates.set(channelState.channelAddress, { state: channelState, commitment });
    if (!transferRecord) {
      return Promise.resolve();
    }
    const { initialState, commitment: transferCommitment, resolver, meta, transferId } = transferRecord;

    const existingRecord = this.transfers.get(transferId) ?? {};
    const activeTransfers = this.transfersInChannel.get(channelState.channelAddress) ?? [];

    if (resolver) {
      // This is a `resolve` update, so remove from channel
      this.transfersInChannel.set(
        channelState.channelAddress,
        activeTransfers.filter((x) => x !== transferId),
      );

      // Update the transfer value
      this.transfers.set(transferId, { ...existingRecord, resolver, meta, transferId });
      return Promise.resolve();
    }

    // Otherwise, it is a `create` update, add to channel
    this.transfers.set(transferId, {
      initialState,
      commitment: transferCommitment,
      meta,
      transferId,
    });
    this.transfersInChannel.set(channelState.channelAddress, [...activeTransfers, transferId]);

    return Promise.resolve();
  }

  getActiveTransfers(channelAddress: string): Promise<CoreTransferState[]> {
    const active = [...(this.transfersInChannel.get(channelAddress) ?? [])];
    const all = active.map((id) => this.transfers.get(id));
    return Promise.resolve(
      all
        .filter((x) => !!x)
        .map((x) => x?.commitment?.state)
        .filter((x) => !!x),
    ) as Promise<CoreTransferState[]>;
  }

  getTransferState(transferId: string): Promise<TransferState | undefined> {
    return Promise.resolve(this.transfers.get(transferId)?.initialState);
  }

  getChannelCommitment(channelAddress: string): Promise<ChannelCommitmentData | undefined> {
    return Promise.resolve(this.channelStates.get(channelAddress)?.commitment);
  }

  getSchemaVersion(): Promise<number | undefined> {
    return Promise.resolve(this.schemaVersion);
  }

  updateSchemaVersion(version?: number): Promise<void> {
    this.schemaVersion = version;
    return Promise.resolve();
  }
}
