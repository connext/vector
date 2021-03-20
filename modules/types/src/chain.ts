import { TransactionReceipt, TransactionRequest, TransactionResponse } from "@ethersproject/abstract-provider";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";

import { Address, HexString } from "./basic";
import { Balance, FullChannelState, FullTransferState } from "./channel";
import { ChannelDispute } from "./dispute";
import { Result, Values, VectorError } from "./error";
import { TransactionEvent, TransactionEventMap } from "./event";
import { ChainProviders, HydratedProviders } from "./network";
import { RegisteredTransfer, TransferName, TransferState, WithdrawCommitmentJson } from "./transferDefinitions";

export const GAS_ESTIMATES = {
  createChannelAndDepositAlice: BigNumber.from(200_000),
  createChannel: BigNumber.from(150_000),
  depositAlice: BigNumber.from(85_000),
  depositBob: BigNumber.from(50_000),
  withdraw: BigNumber.from(95_000),
};

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

  constructor(public readonly message: Values<typeof ChainError.reasons>, public readonly context: any = {}) {
    super(message, context, ChainError.type);
    this.canRetry = Object.values(ChainError.retryableTxErrors).includes(this.message);
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
  assetId: { [assetId: string]: string };
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
    gasPrice: BigNumber,
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
  on<T extends TransactionEvent>(
    event: T,
    callback: (payload: TransactionEventMap[T]) => void | Promise<void>,
    filter?: (payload: TransactionEventMap[T]) => boolean,
  ): void;
  once<T extends TransactionEvent>(
    event: T,
    callback: (payload: TransactionEventMap[T]) => void | Promise<void>,
    filter?: (payload: TransactionEventMap[T]) => boolean,
  ): void;
  off<T extends TransactionEvent>(event?: T): void;
  waitFor<T extends TransactionEvent>(
    event: T,
    timeout: number,
    filter?: (payload: TransactionEventMap[T]) => boolean,
  ): Promise<TransactionEventMap[T]>;
}
