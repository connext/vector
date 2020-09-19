import { BigNumber, BigNumberish, providers } from "ethers";

import { Address, HexString } from "./basic";
import { FullChannelState } from "./channel";
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

export class OnchainTransactionError extends VectorError {
  readonly type = VectorError.errors.OnchainTransactionError;
  static readonly reasons: { [key: string]: string } = {
    SignerNotFound: "Signer not found for chainId",
    SenderNotInChannel: "Sender is not a channel participant",
  };

  constructor(public readonly message: Values<typeof OnchainTransactionError.reasons>) {
    super(message);
  }
}

export type MinimalTransaction = {
  to: Address;
  value: BigNumberish;
  data: HexString;
};

export interface IMultichainTransactionService {
  sendTx(
    minTx: MinimalTransaction,
    chainId: number,
  ): Promise<Result<providers.TransactionResponse, OnchainTransactionError>>;
  getCode(address: Address, chainId: number): Promise<Result<string, OnchainTransactionError>>;
}

export interface IVectorTransactionService {
  sendDepositTx(
    channelState: FullChannelState,
    sender: string,
    amount: string,
    assetId: string,
  ): Promise<Result<providers.TransactionResponse, OnchainTransactionError>>;
  sendWithdrawTx(
    channelState: FullChannelState,
    minTx: MinimalTransaction,
  ): Promise<Result<providers.TransactionResponse, OnchainTransactionError>>;
}

export interface IVectorOnchainService {
  getChannelOnchainBalance(channelAddress: string, chainId: number, assetId: string): Promise<Result<BigNumber, Error>>;
  getLatestDepositByAssetId(
    channelAddress: string,
    chainId: number,
    assetId: string,
    latestDepositNonce: number,
  ): Promise<Result<{ nonce: BigNumber; amount: BigNumber }, Error>>;
  getChannelFactoryBytecode(channelFactoryAddress: string, chainId: number): Promise<Result<string, Error>>;
}
