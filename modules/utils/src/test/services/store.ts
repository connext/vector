/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  FullTransferState,
  FullChannelState,
  IEngineStore,
  WithdrawCommitmentJson,
  StoredTransaction,
  TransactionReason,
  ChannelDispute,
  TransferDispute,
} from "@connext/vector-types";
import { TransactionReceipt, TransactionResponse } from "@ethersproject/abstract-provider";

export class MemoryStoreService implements IEngineStore {
  saveChannelDispute(
    channel: FullChannelState<any>,
    channelDispute: ChannelDispute,
    transferDispute?: TransferDispute,
  ): Promise<void> {
    this.channelDisputes.set(channel.channelAddress, channelDispute);
    const existing = this.channelStates.get(channel.channelAddress);
    if (existing) {
      this.channelStates.set(channel.channelAddress, {
        ...existing,
        inDispute: channel.inDispute,
      });
    }
    if (transferDispute && this.transfers.has(transferDispute.transferId)) {
      this.transferDisputes.set(transferDispute.transferId, transferDispute);
      const t = this.transfers.get(transferDispute.transferId);
      this.transfers.set(t.transferId, { ...t, inDispute: true });
    }
    return Promise.resolve();
  }
  // getChannelDispute(channelAddress: string): Promise<ChannelDispute> {
  //   return Promise.resolve(this.channelDisputes.get(channelAddress));
  // }
  // getTransferDispute(transferAddress: string): Promise<TransferDispute> {
  //   return Promise.resolve(this.transferDisputes.get(transferAddress));
  // }
  getTransactionByHash(transactionHash: string): Promise<StoredTransaction | undefined> {
    throw new Error("Method not implemented.");
  }
  saveTransactionFailure(channelAddress: string, transactionHash: string, error: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  saveTransactionReceipt(channelAddress: string, transaction: TransactionReceipt): Promise<void> {
    throw new Error("Method not implemented.");
  }
  saveTransactionResponse(
    channelAddress: string,
    transactionReason: TransactionReason,
    response: TransactionResponse,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  // Map<channelAddress, transferId[]>
  private transfersInChannel: Map<string, string[]> = new Map();

  // Map<transferId, transferState>
  private transfers: Map<string, FullTransferState> = new Map();

  // Map<channelAddress, channelState>
  private channelStates: Map<string, FullChannelState> = new Map();

  private schemaVersion: number | undefined = undefined;

  private transferDisputes: Map<string, TransferDispute> = new Map();
  private channelDisputes: Map<string, ChannelDispute> = new Map();

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
    const state = this.channelStates.get(channelAddress);
    return Promise.resolve(state);
  }

  getChannelStateByParticipants(
    participantA: string,
    participantB: string,
    chainId: number,
  ): Promise<FullChannelState<any> | undefined> {
    return Promise.resolve(
      [...this.channelStates.values()].find(channelState => {
        channelState.alice === participantA &&
          channelState.bob === participantB &&
          channelState.networkContext.chainId === chainId;
      }),
    );
  }

  getChannelStates(): Promise<FullChannelState[]> {
    return Promise.resolve([...this.channelStates.values()]);
  }

  saveChannelState(channelState: FullChannelState, transfer?: FullTransferState): Promise<void> {
    this.channelStates.set(channelState.channelAddress, {
      ...channelState,
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

  getTransfersByRoutingId(routingId: string): Promise<FullTransferState[]> {
    throw new Error("Method not implemented.");
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
