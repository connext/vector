import {
  ChannelDispute,
  FullChannelState,
  FullTransferState,
  IChainServiceStore,
  IEngineStore,
  ResolveUpdateDetails,
  StoredTransaction,
  StoredTransactionStatus,
  TransactionReason,
  TransferDispute,
  UpdateType,
  WithdrawCommitmentJson,
} from "@connext/vector-types";
import { TransactionResponse, TransactionReceipt } from "@ethersproject/providers";
import Dexie, { DexieOptions } from "dexie";
import { BaseLogger } from "pino";

type StoredTransfer = FullTransferState & { createUpdateNonce: number; resolveUpdateNonce: number; routingId: string };

class VectorIndexedDBDatabase extends Dexie {
  channels: Dexie.Table<FullChannelState, string>;
  transfers: Dexie.Table<StoredTransfer, string>;
  transactions: Dexie.Table<StoredTransaction, string>;
  withdrawCommitment: Dexie.Table<WithdrawCommitmentJson & { transferId: string }, string>;
  values: Dexie.Table<any, string>;

  constructor(
    // eslint-disable-next-line @typescript-eslint/ban-types
    indexedDB?: { open: Function },
    // eslint-disable-next-line @typescript-eslint/ban-types
    idbKeyRange?: { bound: Function; lowerBound: Function; upperBound: Function },
  ) {
    let options: DexieOptions | undefined;
    if (indexedDB && idbKeyRange) {
      options = { indexedDB, IDBKeyRange: idbKeyRange };
    }
    super("VectorIndexedDBDatabase", options);
    this.version(1).stores({
      channels: "channelAddress, [aliceIdentifier+bobIdentifier+networkContext.chainId]",
      transfers: "transferId,[routingId+channelAddress],createUpdateNonce,resolveUpdateNonce,transferResolver",
      transactions: "transactionHash",
      withdrawCommitment: "transferId",
      values: "key",
    });
    this.channels = this.table("channels");
    this.transfers = this.table("transfers");
    this.transactions = this.table("transactions");
    this.withdrawCommitment = this.table("withdrawCommitment");
    this.values = this.table("values");
  }
}

const storedTransferToTransferState = (stored: StoredTransfer): FullTransferState => {
  const transfer: any = stored;
  delete transfer.createUpdateNonce;
  delete transfer.resolveUpdateNonce;
  delete transfer.routingId;
  return transfer as FullTransferState;
};

export class BrowserStore implements IEngineStore, IChainServiceStore {
  private db: VectorIndexedDBDatabase;

  constructor(
    private readonly log: BaseLogger,
    // eslint-disable-next-line @typescript-eslint/ban-types
    indexedDB?: { open: Function },
    // eslint-disable-next-line @typescript-eslint/ban-types
    idbKeyRange?: { bound: Function; lowerBound: Function; upperBound: Function },
  ) {
    this.db = new VectorIndexedDBDatabase(indexedDB, idbKeyRange);
  }

  async saveChannelDispute(
    channel: FullChannelState<any>,
    channelDispute: ChannelDispute,
    transferDispute?: TransferDispute,
  ): Promise<void> {
    await this.db.channels.update(channel.channelAddress, { inDispute: channel.inDispute });
    if (transferDispute) {
      await this.db.transfers.update(transferDispute.transferId, { inDispute: true });
    }
  }

  async connect(): Promise<void> {
    await this.db.open();
  }

  disconnect(): Promise<void> {
    return Promise.resolve(this.db.close());
  }

  getSchemaVersion(): Promise<number | undefined> {
    return Promise.resolve(1);
  }

  updateSchemaVersion(version?: number): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async clear(): Promise<void> {
    await this.db.channels.clear();
    await this.db.transfers.clear();
    await this.db.transactions.clear();
  }

  async saveChannelState(channelState: FullChannelState<any>, transfer?: FullTransferState): Promise<void> {
    await this.db.transaction("rw", this.db.channels, this.db.transfers, async () => {
      await this.db.channels.put(channelState);
      if (channelState.latestUpdate.type === UpdateType.create) {
        await this.db.transfers.put({
          ...transfer!,
          createUpdateNonce: channelState.latestUpdate.nonce,
          resolveUpdateNonce: 0,
          routingId: transfer?.meta?.routingId, // allow indexing on routingId
        });
      } else if (channelState.latestUpdate.type === UpdateType.resolve) {
        await this.db.transfers.update((channelState.latestUpdate.details as ResolveUpdateDetails).transferId, {
          resolveUpdateNonce: channelState.latestUpdate.nonce,
          transferResolver: (channelState.latestUpdate.details as ResolveUpdateDetails).transferResolver,
        } as Partial<StoredTransfer>);
      }
    });
  }

  async getChannelStates(): Promise<FullChannelState<any>[]> {
    const channels = await this.db.channels.toArray();
    return channels;
  }

  async getChannelState(channelAddress: string): Promise<FullChannelState<any> | undefined> {
    const channel = await this.db.channels.get(channelAddress);
    return channel;
  }

  async getChannelStateByParticipants(
    participantA: string,
    participantB: string,
    chainId: number,
  ): Promise<FullChannelState<any> | undefined> {
    const channel = await this.db.channels
      .where("[aliceIdentifier+bobIdentifier+networkContext.chainId]")
      .equals([participantA, participantB, chainId])
      .or("[aliceIdentifier+bobIdentifier+networkContext.chainId]")
      .equals([participantB, participantA, chainId])
      .first();
    return channel;
  }

  async getActiveTransfers(channelAddress: string): Promise<FullTransferState[]> {
    const collection = this.db.transfers.where("resolveUpdateNonce").equals(0);
    const transfers = await collection.toArray();
    return transfers.map(storedTransferToTransferState);
  }

  async getTransferState(transferId: string): Promise<FullTransferState | undefined> {
    const transfer = await this.db.transfers.get(transferId);
    return transfer ? storedTransferToTransferState(transfer) : undefined;
  }

  async getTransferByRoutingId(channelAddress: string, routingId: string): Promise<FullTransferState | undefined> {
    const transfer = await this.db.transfers.get({ channelAddress, routingId });
    return transfer ? storedTransferToTransferState(transfer) : undefined;
  }

  async getTransfersByRoutingId(routingId: string): Promise<FullTransferState[]> {
    const transfers = this.db.transfers.where({ routingId });
    const ret = await transfers.toArray();
    return ret.map(storedTransferToTransferState);
  }

  async saveTransactionResponse(
    channelAddress: string,
    reason: TransactionReason,
    transaction: TransactionResponse,
  ): Promise<void> {
    await this.db.transactions.put({
      //// Helper fields
      channelAddress,
      status: StoredTransactionStatus.submitted,
      reason,

      //// Provider fields
      // Minimum fields (should always be defined)
      to: transaction.to!,
      from: transaction.from,
      data: transaction.data,
      value: transaction.value.toString(),
      chainId: transaction.chainId,

      // TransactionRequest fields (defined when tx populated)
      nonce: transaction.nonce,
      gasLimit: transaction.gasLimit.toString(),
      gasPrice: transaction.gasPrice.toString(),

      // TransactionResponse fields (defined when submitted)
      transactionHash: transaction.hash, // may be edited on mining
      timestamp: transaction.timestamp,
      raw: transaction.raw,
      blockHash: transaction.blockHash,
      blockNumber: transaction.blockNumber,
    });
  }

  async saveTransactionReceipt(channelAddress: string, transaction: TransactionReceipt): Promise<void> {
    await this.db.transactions.update(transaction.transactionHash, {
      status: StoredTransactionStatus.mined,
      logs: transaction.logs,
      contractAddress: transaction.contractAddress,
      transactionIndex: transaction.transactionIndex,
      root: transaction.root,
      gasUsed: transaction.gasUsed.toString(),
      logsBloom: transaction.logsBloom,
      cumulativeGasUsed: transaction.cumulativeGasUsed.toString(),
      byzantium: transaction.byzantium,
    });
  }

  async saveTransactionFailure(channelAddress: string, transactionHash: string, error: string): Promise<void> {
    await this.db.transactions.update(transactionHash, {
      status: StoredTransactionStatus.failed,
      error,
    });
  }

  async getTransactionByHash(transactionHash: string): Promise<StoredTransaction | undefined> {
    const tx = await this.db.transactions.get(transactionHash);
    return tx;
  }

  async saveWithdrawalCommitment(transferId: string, withdrawCommitment: WithdrawCommitmentJson): Promise<void> {
    await this.db.withdrawCommitment.put({ ...withdrawCommitment, transferId });
  }

  async getWithdrawalCommitment(transferId: string): Promise<WithdrawCommitmentJson | undefined> {
    const w = await this.db.withdrawCommitment.get(transferId);
    return w;
  }
}
