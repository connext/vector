import { FullChannelState, CoreTransferState, IEngineStore, TransferState } from "@connext/vector-types";

export class MemoryStoreService implements IEngineStore {
  getSchemaVersion(): Promise<number> {
    throw new Error("Method not implemented.");
  }
  updateSchemaVersion(version?: number): Promise<void> {
    throw new Error("Method not implemented.");
  }
  // Map<channelAddress, transferId[]>
  private transfersInChannel: Map<string, string[]> = new Map();

  // Map<transferId, transferState>
  private transfers: Map<string, { state: TransferState; core: CoreTransferState }> = new Map();

  // Map<channelAddress, channelState>
  private channelStates: Map<string, FullChannelState> = new Map();

  getCoreTransferState(transferId: string): Promise<CoreTransferState | undefined> {
    return Promise.resolve(this.transfers.get(transferId)?.core);
  }

  connect(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  getChannelState(channelAddress: string): Promise<FullChannelState<any> | undefined> {
    return Promise.resolve(this.channelStates.get(channelAddress));
  }

  saveChannelState(channelState: FullChannelState<any>): Promise<void> {
    this.channelStates.set(channelState.channelAddress, channelState);
    return Promise.resolve();
  }

  getActiveTransfers(channelAddress: string): Promise<CoreTransferState[]> {
    const active = [...(this.transfersInChannel.get(channelAddress) ?? [])];
    const all = active.map((id) => this.transfers.get(id));
    return Promise.resolve(
      all
        .filter((x) => !!x)
        .map((x) => x?.core)
        .filter((x) => !!x),
    ) as Promise<CoreTransferState[]>;
  }

  getTransferState(transferId: string): Promise<TransferState | undefined> {
    return Promise.resolve(this.transfers.get(transferId)?.state);
  }

  removeTransferFromChannel(channelAddress: string, transferId: string, state: TransferState): Promise<void> {
    // Update existing transfer record with final state
    const record = this.transfers.get(transferId)!;
    this.transfers.set(transferId, { ...record, state });

    // Remove from active
    const previouslyActive = this.transfersInChannel.get(channelAddress) || [];
    this.transfersInChannel.set(
      channelAddress,
      [...previouslyActive].filter((x) => x === transferId),
    );
    return Promise.resolve();
  }

  saveTransferToChannel(channelAddress: string, transfer: CoreTransferState, state: TransferState): Promise<void> {
    // Save record
    this.transfers.set(transfer.transferId, { core: transfer, state });

    // Add to active
    const existing = this.transfersInChannel.get(channelAddress) || [];
    this.transfersInChannel.set(channelAddress, [...existing, transfer.transferId]);

    return Promise.resolve();
  }
}
