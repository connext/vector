import {
  ChannelCommitmentData,
  FullChannelState,
  FullTransferState,
  IChainServiceStore,
  IEngineStore,
  StoredTransaction,
  TransactionReason,
  WithdrawCommitmentJson,
} from "@connext/vector-types";
import { providers } from "ethers";

export class BrowserStore implements IEngineStore, IChainServiceStore {
  async saveTransactionResponse(
    channelAddress: string,
    reason: TransactionReason,
    transaction: providers.TransactionResponse,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  async saveTransactionReceipt(channelAddress: string, transaction: providers.TransactionReceipt): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getWithdrawalCommitment(transferId: string): Promise<WithdrawCommitmentJson | undefined> {
    throw new Error("Method not implemented.");
  }
  getTransferByRoutingId(channelAddress: string, routingId: string): Promise<FullTransferState<any> | undefined> {
    throw new Error("Method not implemented.");
  }
  getTransfersByRoutingId(routingId: string): Promise<FullTransferState<any>[]> {
    throw new Error("Method not implemented.");
  }
  saveWithdrawalCommitment(transferId: string, withdrawCommitment: WithdrawCommitmentJson): Promise<void> {
    throw new Error("Method not implemented.");
  }
  connect(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  disconnect(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getSchemaVersion(): Promise<number | undefined> {
    throw new Error("Method not implemented.");
  }
  updateSchemaVersion(version?: number): Promise<void> {
    throw new Error("Method not implemented.");
  }
  clear(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getChannelStates(): Promise<FullChannelState<any>[]> {
    throw new Error("Method not implemented.");
  }
  getChannelState(channelAddress: string): Promise<FullChannelState<any> | undefined> {
    throw new Error("Method not implemented.");
  }
  getChannelStateByParticipants(
    participantA: string,
    participantB: string,
    chainId: number,
  ): Promise<FullChannelState<any> | undefined> {
    throw new Error("Method not implemented.");
  }
  getChannelCommitment(channelAddress: string): Promise<ChannelCommitmentData | undefined> {
    throw new Error("Method not implemented.");
  }
  getActiveTransfers(channelAddress: string): Promise<FullTransferState<any>[]> {
    throw new Error("Method not implemented.");
  }
  getTransferState(transferId: string): Promise<FullTransferState<any> | undefined> {
    throw new Error("Method not implemented.");
  }
  saveChannelState(
    channelState: FullChannelState<any>,
    commitment: ChannelCommitmentData,
    transfer?: FullTransferState<any>,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  getTransactionByHash(transactionHash: string): Promise<StoredTransaction | undefined> {
    throw new Error("Method not implemented.");
  }
  saveTransactionFailure(channelAddress: string, transactionHash: string, error: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
