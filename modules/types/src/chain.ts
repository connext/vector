import { TransactionReceipt, TransactionRequest, TransactionResponse } from "@ethersproject/abstract-provider";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { ChainReaderEvent, ChainReaderEventMap } from ".";

import { Address, HexString } from "./basic";
import { Balance, FullChannelState, FullTransferState } from "./channel";
import { ChannelDispute } from "./dispute";
import { Result, Values, VectorError } from "./error";
import { ChainServiceEvent, ChainServiceEventMap } from "./event";
import { ChainProviders, HydratedProviders } from "./network";
import { RegisteredTransfer, TransferName, TransferState, WithdrawCommitmentJson } from "./transferDefinitions";

export const GAS_ESTIMATES = {
  createChannelAndDepositAlice: BigNumber.from(200_000), // 0x5a78baf521e5739b2b63626566f6b360a242b52734662db439a2c3256d3e1f97
  createChannel: BigNumber.from(150_000), // 0x45690e81cfc5576d11ecda7938ce91af513a873f8c7e4f26bf2a898ee45ae8ab
  depositAlice: BigNumber.from(85_000), // 0x0ed5459c7366d862177408328591c6df5c534fe4e1fbf4a5dd0abbe3d9c761b3
  depositBob: BigNumber.from(50_000),
  withdraw: BigNumber.from(95_000), // 0x4d4466ed10b5d39c0a80be859dc30bca0120b5e8de10ed7155cc0b26da574439
};

// NOTE: you cannot easily use `estimateGas` to calculate the costs
// of a withdrawal onchain. This is because to make sure that the
// estimate call does not revert you would need to have the correct
// signatures, make sure the channel is deployed, etc. So just
// use a hardcoded estimate for a simple withdrawal, then use the
// callTo and callData to estimate the gas used on the withdraw
// helper
// TODO: update fees to account for a withdraw helper
export const SIMPLE_WITHDRAWAL_GAS_ESTIMATE = BigNumber.from(100_000);

export const ERC20Abi = [
  // Read-Only Functions
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function totalSupply() external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)",

  // Authenticated Functions
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function transfer(address to, uint amount) returns (boolean)",
  "function transferFrom(address sender, address recipient, uint256 amount) external returns (bool)",

  // Events
  "event Transfer(address indexed from, address indexed to, uint amount)",
  "event Approval(address indexed owner, address indexed spender, uint256 value)",
];

export class ChainError extends VectorError {
  static readonly type = "ChainError";
  static readonly reasons = {
    ProviderNotFound: "Provider not found for chainId",
    SignerNotFound: "Signer not found for chainId",
    SenderNotInChannel: "Sender is not a channel participant",
    NegativeDepositAmount: "Cannot deposit a negative amount",
    NotEnoughFunds: "Not enough funds in wallet",
    FailedToDeploy: "Could not deploy vector channel",
    FailedToSendTx: "Failed to send transaction to chain",
    TransferNotRegistered: "Transfer not in registry",
    MissingSigs: "Channel state is not double signed",
    ResolverNeeded: "Transfer resolver must be provided in dispute",
    NotInitialState: "Transfer must be disputed with initial state",
    MultisigDeployed: "Multisig already deployed",
    TransferNotFound: "Transfer is not included in active transfers",
    TxAlreadyMined: "Tranasction already mined",
    TxNotFound: "Transaction not found",
    TxReverted: "Transaction reverted on chain",
  };

  // Errors you would see from trying to send a transaction, and
  // would retry by default
  static readonly retryableTxErrors = {
    BadNonce: "the tx doesn't have the correct nonce",
    InvalidNonce: "Invalid nonce",
    MissingHash: "no transaction hash found in tx response",
    UnderpricedReplancement: "replacement transaction underpriced",
  };

  readonly canRetry: boolean;

  constructor(public readonly message: Values<typeof ChainError.reasons> | string, public readonly context: any = {}) {
    super(message, context, ChainError.type);
    this.canRetry = !!Object.values(ChainError.retryableTxErrors).find(
      (msg) => msg.includes(this.message) || this.message.includes(msg),
    );
  }
}

export type ChainInfo = {
  name: string;
  chainId: number;
  shortName: string;
  chain: string;
  network: string;
  networkId: number;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  assetId: {
    [assetId: string]: {
      symbol: string;
      mainnetEquivalent: string;
    };
  };
  rpc: string[];
  faucets: string[];
  infoURL: string;
};

export type MinimalTransaction = {
  to: Address;
  value: BigNumberish;
  data: HexString;
};

export type MultisigTransaction = MinimalTransaction & {
  nonce: BigNumberish;
};

export interface IVectorChainReader {
  getTotalDepositedA(channelAddress: string, chainId: number, assetId: string): Promise<Result<BigNumber, ChainError>>;

  getTotalDepositedB(channelAddress: string, chainId: number, assetId: string): Promise<Result<BigNumber, ChainError>>;

  getChannelFactoryBytecode(channelFactoryAddress: string, chainId: number): Promise<Result<string, ChainError>>;

  getChannelMastercopyAddress(channelFactoryAddress: string, chainId: number): Promise<Result<string, ChainError>>;

  getDecimals(assetId: string, chainId: number): Promise<Result<number, ChainError>>;

  getChannelAddress(
    initiator: string,
    responder: string,
    channelFactoryAddress: string,
    chainId: number,
  ): Promise<Result<string, ChainError>>;

  getRegisteredTransferByName(
    name: TransferName,
    transferRegistry: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<RegisteredTransfer, ChainError>>;

  getRegisteredTransferByDefinition(
    definition: Address,
    transferRegistry: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<RegisteredTransfer, ChainError>>;

  getRegisteredTransfers(
    transferRegistry: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<RegisteredTransfer[], ChainError>>;

  getChainProviders(): Result<ChainProviders, ChainError>;

  getHydratedProviders(): Result<HydratedProviders, ChainError>;

  create(
    initialState: TransferState,
    balance: Balance,
    transferDefinition: string,
    transferRegistryAddress: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<boolean, ChainError>>;

  resolve(transfer: FullTransferState, chainId: number, bytecode?: string): Promise<Result<Balance, ChainError>>;

  getCode(address: Address, chainId: number): Promise<Result<string, ChainError>>;

  getBlockNumber(chainId: number): Promise<Result<number, ChainError>>;

  getGasPrice(chainId: number): Promise<Result<BigNumber, ChainError>>;

  estimateGas(chainId: number, transaction: TransactionRequest): Promise<Result<BigNumber, ChainError>>;

  getTokenAllowance(
    tokenAddress: string,
    owner: string,
    spender: string,
    chainId: number,
  ): Promise<Result<BigNumber, ChainError>>;

  getChannelDispute(channelAddress: string, chainId: number): Promise<Result<ChannelDispute | undefined, ChainError>>;

  getSyncing(
    chainId: number,
  ): Promise<
    Result<
      | boolean
      | {
          startingBlock: string;
          currentBlock: string;
          highestBlock: string;
        },
      ChainError
    >
  >;

  getWithdrawalTransactionRecord(
    withdrawData: WithdrawCommitmentJson,
    channelAddress: string,
    chainId: number,
  ): Promise<Result<boolean, ChainError>>;

  /**
   * Watches the channel for any dispute events and parrots them in
   * cleaned types
   * @param channelAddress Address of channel to parrot events for
   * @param chainId Chain of channel
   */
  registerChannel(channelAddress: string, chainId: number): Promise<Result<void, ChainError>>;

  on<T extends ChainReaderEvent>(
    event: T,
    callback: (payload: ChainReaderEventMap[T]) => void | Promise<void>,
    filter?: (payload: ChainReaderEventMap[T]) => boolean,
  ): void;
  once<T extends ChainReaderEvent>(
    event: T,
    callback: (payload: ChainReaderEventMap[T]) => void | Promise<void>,
    filter?: (payload: ChainReaderEventMap[T]) => boolean,
  ): void;
  off<T extends ChainReaderEvent>(event?: T): void;
  waitFor<T extends ChainReaderEvent>(
    event: T,
    timeout: number,
    filter?: (payload: ChainReaderEventMap[T]) => boolean,
  ): Promise<ChainReaderEventMap[T]>;
}

export type TransactionResponseWithResult = TransactionResponse & {
  completed: (confirmations?: number) => Promise<Result<TransactionReceipt, ChainError>>;
};
export interface IVectorChainService extends IVectorChainReader {
  // Happy case methods
  sendDepositTx(
    channelState: FullChannelState,
    sender: string,
    amount: string,
    assetId: string,
  ): Promise<Result<TransactionResponseWithResult, ChainError>>;
  sendWithdrawTx(
    channelState: FullChannelState,
    minTx: MinimalTransaction,
  ): Promise<Result<TransactionResponseWithResult, ChainError>>;
  sendDeployChannelTx(
    channelState: FullChannelState,
    deposit?: { amount: string; assetId: string }, // Included IFF createChannelAndDepositAlice
  ): Promise<Result<TransactionResponseWithResult, ChainError>>;

  // Dispute methods
  sendDisputeChannelTx(channelState: FullChannelState): Promise<Result<TransactionResponseWithResult, ChainError>>;
  sendDefundChannelTx(channelState: FullChannelState): Promise<Result<TransactionResponseWithResult, ChainError>>;
  sendDisputeTransferTx(
    transferIdToDispute: string,
    activeTransfers: FullTransferState[],
  ): Promise<Result<TransactionResponseWithResult, ChainError>>;
  sendDefundTransferTx(transferState: FullTransferState): Promise<Result<TransactionResponseWithResult, ChainError>>;
  sendExitChannelTx(
    channelAddress: string,
    chainId: number,
    assetId: string,
    owner: string,
    recipient: string,
  ): Promise<Result<TransactionResponseWithResult, ChainError>>;

  // Resend tx at the same nonce
  speedUpTx(
    chainId: number,
    tx: MinimalTransaction & { transactionHash: string; nonce: number },
  ): Promise<Result<TransactionResponseWithResult, ChainError>>;

  // Event methods
  on<T extends ChainServiceEvent>(
    event: T,
    callback: (payload: ChainServiceEventMap[T]) => void | Promise<void>,
    filter?: (payload: ChainServiceEventMap[T]) => boolean,
  ): void;
  once<T extends ChainServiceEvent>(
    event: T,
    callback: (payload: ChainServiceEventMap[T]) => void | Promise<void>,
    filter?: (payload: ChainServiceEventMap[T]) => boolean,
  ): void;
  off<T extends ChainServiceEvent>(event?: T): void;
  waitFor<T extends ChainServiceEvent>(
    event: T,
    timeout: number,
    filter?: (payload: ChainServiceEventMap[T]) => boolean,
  ): Promise<ChainServiceEventMap[T]>;
}
