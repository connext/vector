import { TransactionResponse } from "@ethersproject/abstract-provider";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";

import { Address, HexString } from "./basic";
import { Balance, FullChannelState, FullTransferState } from "./channel";
import { ChannelDispute } from "./dispute";
import { Result, Values, VectorError } from "./error";
import { ChainProviders, HydratedProviders } from "./network";
import { RegisteredTransfer, TransferName, TransferState } from "./transferDefinitions";

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
  readonly type = "ChainError";
  static readonly reasons = {
    ProviderNotFound: "Provider not found for chainId",
    SignerNotFound: "Signer not found for chainId",
    SenderNotInChannel: "Sender is not a channel participant",
    NotEnoughFunds: "Not enough funds in wallet",
    FailedToDeploy: "Could not deploy vector channel",
    FailedToSendTx: "Failed to send transaction to chain",
    TransferNotRegistered: "Transfer not in registry",
    MissingSigs: "Channel state is not double signed",
    ResolverNeeded: "Transfer resolver must be provided in dispute",
    NotInitialState: "Transfer must be disputed with initial state",
    MultisigDeployed: "Multisig already deployed",
    TransferNotFound: "Transfer is not included in active transfers",
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
    super(message);
    this.canRetry = Object.values(ChainError.retryableTxErrors).includes(this.message);
  }
}

export type MinimalTransaction = {
  to: Address;
  value: BigNumberish;
  data: HexString;
};

export type MultisigTransaction = MinimalTransaction & {
  nonce: BigNumberish;
};

export interface IVectorChainReader {
  getChannelOnchainBalance(
    channelAddress: string,
    chainId: number,
    assetId: string,
  ): Promise<Result<BigNumber, ChainError>>;

  getTotalDepositedA(channelAddress: string, chainId: number, assetId: string): Promise<Result<BigNumber, ChainError>>;

  getTotalDepositedB(channelAddress: string, chainId: number, assetId: string): Promise<Result<BigNumber, ChainError>>;

  getChannelFactoryBytecode(channelFactoryAddress: string, chainId: number): Promise<Result<string, ChainError>>;

  getChannelMastercopyAddress(channelFactoryAddress: string, chainId: number): Promise<Result<string, ChainError>>;

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
}

export interface IVectorChainService extends IVectorChainReader {
  // Happy case methods
  sendDepositTx(
    channelState: FullChannelState,
    sender: string,
    amount: string,
    assetId: string,
  ): Promise<Result<TransactionResponse, ChainError>>;
  sendWithdrawTx(
    channelState: FullChannelState,
    minTx: MinimalTransaction,
  ): Promise<Result<TransactionResponse, ChainError>>;
  sendDeployChannelTx(
    channelState: FullChannelState,
    deposit?: { amount: string; assetId: string }, // Included IFF createChannelAndDepositAlice
  ): Promise<Result<TransactionResponse, ChainError>>;

  // Dispute methods
  sendDisputeChannelTx(channelState: FullChannelState): Promise<Result<TransactionResponse, ChainError>>;
  sendDefundChannelTx(channelState: FullChannelState): Promise<Result<TransactionResponse, ChainError>>;
  sendDisputeTransferTx(
    transferIdToDispute: string,
    activeTransfers: FullTransferState[],
  ): Promise<Result<TransactionResponse, ChainError>>;
  sendDefundTransferTx(transferState: FullTransferState): Promise<Result<TransactionResponse, ChainError>>;
}
