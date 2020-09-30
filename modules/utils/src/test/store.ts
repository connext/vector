/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  FullTransferState,
  FullChannelState,
  ChannelCommitmentData,
  IEngineStore,
  WithdrawCommitmentJson,
} from "@connext/vector-types";

export class MemoryStoreService implements IEngineStore {
  // Map<channelAddress, transferId[]>
  private transfersInChannel: Map<string, string[]> = new Map();

  // Map<transferId, transferState>
  private transfers: Map<string, FullTransferState> = new Map();

  // Map<channelAddress, channelState>
  private channelStates: Map<string, { state: FullChannelState; commitment: ChannelCommitmentData }> = new Map();

  private schemaVersion: number | undefined = undefined;

  connect(): Promise<void> {
    return Promise.resolve();
  }

  disconnect(): Promise<void> {
    return Promise.resolve();
  }

  clear(): Promise<void> {
    this.channelStates.clear();
    this.transfersInChannel.clear();
    this.transfers.clear();
    return Promise.resolve();
  }

  getChannelState(channelAddress: string): Promise<FullChannelState<any> | undefined> {
    const { state } = this.channelStates.get(channelAddress) ?? {};
    return Promise.resolve(state);
  }

  getChannelStateByParticipants(
    participantA: string,
    participantB: string,
    chainId: number,
  ): Promise<FullChannelState<any> | undefined> {
    return Promise.resolve(
      [...this.channelStates.values()].find(channelState => {
        channelState.state.alice === participantA &&
          channelState.state.bob === participantB &&
          channelState.state.networkContext.chainId === chainId;
      })?.state,
    );
  }

  getChannelStates(): Promise<FullChannelState[]> {
    return Promise.resolve([...this.channelStates.values()].map(c => c.state));
  }

  saveChannelState(
    channelState: FullChannelState,
    commitment: ChannelCommitmentData,
    transfer?: FullTransferState,
  ): Promise<void> {
    this.channelStates.set(channelState.channelAddress, {
      state: {
        ...channelState,
      },
      commitment,
    });
    if (!transfer) {
      return Promise.resolve();
    }

    // Update the transfer value
    this.transfers.set(transfer.transferId, transfer);

    const activeTransfers = this.transfersInChannel.get(channelState.channelAddress) ?? [];

    if (transfer.transferResolver) {
      // This is a `resolve` update, so remove from channel
      this.transfersInChannel.set(
        channelState.channelAddress,
        activeTransfers.filter(x => x !== transfer.transferId),
      );
      return Promise.resolve();
    }

    this.transfersInChannel.set(channelState.channelAddress, [...activeTransfers, transfer.transferId]);

    return Promise.resolve();
  }

  getActiveTransfers(channelAddress: string): Promise<FullTransferState[]> {
    const active = [...(this.transfersInChannel.get(channelAddress) ?? [])];
    const all = active.map(id => this.transfers.get(id)).filter(x => !!x);
    return Promise.resolve(all as FullTransferState[]);
  }

  getTransferState(transferId: string): Promise<FullTransferState | undefined> {
    return Promise.resolve(this.transfers.get(transferId));
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

  getWithdrawalCommitment(transferId: string): Promise<WithdrawCommitmentJson | undefined> {
    return Promise.resolve(undefined);
  }
  saveWithdrawalCommitment(transferId: string, withdrawCommitment: WithdrawCommitmentJson): Promise<void> {
    return Promise.resolve();
  }
  getTransferByRoutingId(channelAddress: string, routingId: string): Promise<FullTransferState | undefined> {
    return Promise.resolve(undefined);
  }
}
