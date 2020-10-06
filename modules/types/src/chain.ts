import { BigNumber, BigNumberish, providers } from "ethers";

import { Address, HexString } from "./basic";
import { Balance, FullChannelState, FullTransferState } from "./channel";
import { Result, Values, VectorError } from "./error";

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
  readonly type = VectorError.errors.ChainError;
  static readonly reasons = {
    ProviderNotFound: "Provider not found for chainId",
    SignerNotFound: "Signer not found for chainId",
    SenderNotInChannel: "Sender is not a channel participant",
    NotEnoughFunds: "Not enough funds in wallet",
    FailedToSendTx: "Failed to send transaction to chain",
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

  getTransferEncodings(
    transferDefinition: string,
    chainId: number,
    bytecode?: string,
  ): Promise<Result<string[], ChainError>>;

  create(transfer: FullTransferState, chainId: number, bytecode?: string): Promise<Result<boolean, ChainError>>;

  resolve(transfer: FullTransferState, chainId: number, bytecode?: string): Promise<Result<Balance, ChainError>>;

  getCode(address: Address, chainId: number): Promise<Result<string, ChainError>>;

  getBlockNumber(chainId: number): Promise<Result<number, ChainError>>;
}

export interface IVectorChainService extends IVectorChainReader {
  sendDepositTx(
    channelState: FullChannelState,
    sender: string,
    amount: string,
    assetId: string,
  ): Promise<Result<providers.TransactionResponse, ChainError>>;
  sendWithdrawTx(
    channelState: FullChannelState,
    minTx: MinimalTransaction,
  ): Promise<Result<providers.TransactionResponse, ChainError>>;
}
