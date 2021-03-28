import {
  ChannelDispute,
  CoreChannelState,
  CoreTransferState,
  FullChannelState,
  FullTransferState,
  GetTransfersFilterOpts,
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

type StoredTransfer = FullTransferState & {
  createUpdateNonce: number;
  resolveUpdateNonce: number;
  routingId: string;
  createdAt: Date;
};

const storedTransferToTransferState = (stored: StoredTransfer): FullTransferState => {
  const transfer: any = stored;
  delete transfer.createUpdateNonce;
  delete transfer.resolveUpdateNonce;
  delete transfer.routingId;
  delete transfer.createdAt;
  return transfer as FullTransferState;
};

const getStoreName = (publicIdentifier: string) => {
  return `${publicIdentifier}-store`;
};
const NON_NAMESPACED_STORE = "VectorIndexedDBDatabase";
class VectorIndexedDBDatabase extends Dexie {
  channels: Dexie.Table<FullChannelState, string>;
  transfers: Dexie.Table<StoredTransfer, string>;
  transactions: Dexie.Table<StoredTransaction, string>;
  withdrawCommitment: Dexie.Table<WithdrawCommitmentJson & { transferId: string }, string>;
  values: Dexie.Table<any, string>;
  // database name
  name: string;

  constructor(
    name: string,
    // eslint-disable-next-line @typescript-eslint/ban-types
    indexedDB?: { open: Function },
    // eslint-disable-next-line @typescript-eslint/ban-types
    idbKeyRange?: { bound: Function; lowerBound: Function; upperBound: Function },
  ) {
    let options: DexieOptions | undefined;
    if (indexedDB && idbKeyRange) {
      options = { indexedDB, IDBKeyRange: idbKeyRange };
    }
    super(name, options);
    this.version(1).stores({
      channels:
        "channelAddress, [aliceIdentifier+bobIdentifier+networkContext.chainId], [alice+bob+networkContext.chainId]",
      transfers:
        "transferId, [routingId+channelAddress], [createUpdateNonce+channelAddress], [resolveUpdateNonce+channelAddress], [transferResolver+channelAddress]",
      transactions: "transactionHash",
      withdrawCommitment: "transferId",
      values: "key",
    });
    this.version(2)
      .stores({
        channels:
          "channelAddress, [aliceIdentifier+bobIdentifier+networkContext.chainId], [alice+bob+networkContext.chainId], createdAt",
        transfers:
          "transferId, [routingId+channelAddress], [createUpdateNonce+channelAddress], [resolveUpdateNonce+channelAddress], [transferResolver+channelAddress], createdAt, resolveUpdateNonce, channelAddress",
      })
      .upgrade((tx) => {
        // An upgrade function for version 3 will upgrade data based on version 2.
        tx.table("channels")
          .toCollection()
          .modify((channel) => {
            channel.createdAt = new Date();
          });
        tx.table("transfers")
          .toCollection()
          .modify((transfer) => {
            transfer.createdAt = new Date();
          });
      });

    this.version(3).stores({
      withdrawCommitment: "transferId,transactionHash",
    });

    this.channels = this.table("channels");
    this.transfers = this.table("transfers");
    this.transactions = this.table("transactions");
    this.withdrawCommitment = this.table("withdrawCommitment");
    this.values = this.table("values");
    this.name = name;
  }
}

export class BrowserStore implements IEngineStore, IChainServiceStore {
  private db: VectorIndexedDBDatabase;

  // NOTE: this could be private, but makes it difficult to test because
  // you can't mock the `Dexie.exists` call used in the static `create`
  // function. However, the constructor should *not* be used when creating
  // an instance of the BrowserStore
  constructor(
    private readonly dbName: string,
    private readonly log: BaseLogger,
    // eslint-disable-next-line @typescript-eslint/ban-types
    indexedDB?: { open: Function },
    // eslint-disable-next-line @typescript-eslint/ban-types
    idbKeyRange?: { bound: Function; lowerBound: Function; upperBound: Function },
  ) {
    this.db = new VectorIndexedDBDatabase(dbName, indexedDB, idbKeyRange);
  }

  public static async create(
    publicIdentifer: string,
    log: BaseLogger,
    // eslint-disable-next-line @typescript-eslint/ban-types
    indexedDB?: { open: Function },
    // eslint-disable-next-line @typescript-eslint/ban-types
    idbKeyRange?: { bound: Function; lowerBound: Function; upperBound: Function },
  ): Promise<BrowserStore> {
    const name = (await Dexie.exists(NON_NAMESPACED_STORE)) ? NON_NAMESPACED_STORE : getStoreName(publicIdentifer);
    const store = new BrowserStore(name, log, indexedDB, idbKeyRange);
    await store.connect();
    return store;
  }

  public async connect(): Promise<void> {
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

  async saveChannelStateAndTransfers(
    channelState: FullChannelState,
    activeTransfers: FullTransferState[],
  ): Promise<void> {
    await this.db.transaction("rw", this.db.channels, this.db.transfers, async () => {
      // remove all "active" transfers
      const currActive = await this.getActiveTransfers(channelState.channelAddress);
      // TODO: can we "unassociate" them without deleting them? GH #431
      await this.db.transfers.bulkDelete(currActive.map((t) => t.transferId));
      // save channel
      await this.db.channels.put(channelState);
      // save all active transfers
      await this.db.transfers.bulkPut(
        activeTransfers.map((transfer) => {
          return {
            ...transfer,
            createUpdateNonce: transfer.channelNonce + 1,
            resolveUpdateNonce: 0,
            routingId: transfer?.meta?.routingId,
            createdAt: new Date(),
          };
        }),
      );
    });
  }

  async saveChannelState(channelState: FullChannelState, transfer?: FullTransferState): Promise<void> {
    await this.db.transaction("rw", this.db.channels, this.db.transfers, async () => {
      await this.db.channels.put(channelState);
      if (channelState.latestUpdate.type === UpdateType.create) {
        await this.db.transfers.put({
          ...transfer!,
          createUpdateNonce: channelState.latestUpdate.nonce,
          resolveUpdateNonce: 0,
          routingId: transfer?.meta?.routingId, // allow indexing on routingId
          createdAt: new Date(),
        });
      } else if (channelState.latestUpdate.type === UpdateType.resolve) {
        await this.db.transfers.update((channelState.latestUpdate.details as ResolveUpdateDetails).transferId, {
          resolveUpdateNonce: channelState.latestUpdate.nonce,
          transferResolver: (channelState.latestUpdate.details as ResolveUpdateDetails).transferResolver,
        } as Partial<StoredTransfer>);
      }
    });
  }

  async getChannelStates(): Promise<FullChannelState[]> {
    const channels = await this.db.channels.toArray();
    return channels;
  }

  async getChannelState(channelAddress: string): Promise<FullChannelState | undefined> {
    const channel = await this.db.channels.get(channelAddress);
    return channel;
  }

  async getChannelStateByParticipants(
    publicIdentifierA: string,
    publicIdentifierB: string,
    chainId: number,
  ): Promise<FullChannelState | undefined> {
    const channel = await this.db.channels
      .where("[aliceIdentifier+bobIdentifier+networkContext.chainId]")
      .equals([publicIdentifierA, publicIdentifierB, chainId])
      .or("[aliceIdentifier+bobIdentifier+networkContext.chainId]")
      .equals([publicIdentifierB, publicIdentifierA, chainId])
      .first();
    return channel;
  }

  async getActiveTransfers(channelAddress: string): Promise<FullTransferState[]> {
    const collection = this.db.transfers.where("[resolveUpdateNonce+channelAddress]").equals([0, channelAddress]);
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

  async getTransfers(filterOpts?: GetTransfersFilterOpts): Promise<FullTransferState[]> {
    const filterQuery: any = [];
    if (filterOpts?.channelAddress) {
      filterQuery.push({ index: "channelAddress", function: "equals", params: filterOpts.channelAddress });
    }

    // start and end
    if (filterOpts?.startDate && filterOpts.endDate) {
      filterQuery.push({ index: "channelAddress", function: "between", params: filterOpts.channelAddress });
    } else if (filterOpts?.startDate) {
      filterQuery.push({ index: "channelAddress", function: "equals", params: filterOpts.channelAddress });
    } else if (filterOpts?.endDate) {
      filterQuery.push({ index: "channelAddress", function: "equals", params: filterOpts.channelAddress });
    }

    let collection = this.db.transfers.toCollection();
    if (filterOpts?.channelAddress) {
      collection = collection.filter((transfer) => transfer.channelAddress === filterOpts.channelAddress);
    }
    if (filterOpts?.startDate && filterOpts.endDate) {
      collection = collection.filter(
        (transfer) => transfer.createdAt >= filterOpts.startDate! && transfer.createdAt <= filterOpts.endDate!,
      );
    } else if (filterOpts?.startDate) {
      collection = collection.filter((transfer) => transfer.createdAt >= filterOpts.startDate!);
    } else if (filterOpts?.endDate) {
      collection = collection.filter((transfer) => transfer.createdAt <= filterOpts.endDate!);
    }

    if (filterOpts?.active) {
      collection = collection.filter((transfer) => transfer.resolveUpdateNonce === 0);
    }

    if (filterOpts?.routingId) {
      collection = collection.filter((transfer) => transfer.routingId === filterOpts.routingId);
    }

    if (filterOpts?.transferDefinition) {
      collection = collection.filter((transfer) => transfer.transferDefinition === filterOpts.transferDefinition);
    }

    const transfers = await collection.toArray();
    return transfers.map(storedTransferToTransferState);
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
    if (!w) {
      return w;
    }
    const { transferId: t, ...commitment } = w;
    return commitment;
  }

  async getWithdrawalCommitmentByTransactionHash(transactionHash: string): Promise<WithdrawCommitmentJson | undefined> {
    const w = await this.db.withdrawCommitment.get({ transactionHash });
    if (!w) {
      return w;
    }
    const { transferId, ...commitment } = w;
    return commitment;
  }

  saveTransferDispute(
    channelAddress: string,
    transferDispute: TransferDispute,
    disputedTransfer?: CoreTransferState,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getTransferDispute(transferId: string): Promise<TransferDispute | undefined> {
    throw new Error("Method not implemented.");
  }

  async saveChannelDispute(
    channelAddress: string,
    channelDispute: ChannelDispute,
    disputedChannel?: CoreChannelState,
  ): Promise<void> {
    throw new Error("Method not implemented");
  }
  getChannelDispute(channelAddress: string): Promise<ChannelDispute | undefined> {
    throw new Error("Method not implemented.");
  }
}
