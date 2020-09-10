import * as ethers from "ethers";
import { providers } from "ethers";

export { Contract } from "ethers";

export type JsonRpcProvider = providers.JsonRpcProvider;
export const JsonRpcProvider = providers.JsonRpcProvider;

export type TransactionReceipt = providers.TransactionReceipt;

export type TransactionResponse = providers.TransactionResponse;

export type BigNumberish = ethers.BigNumberish;
export type Network = providers.Network;
export type Transaction = providers.TransactionRequest;

// special strings
// these function more as documentation for devs than checked types
export type ABIEncoding = string; // eg "tuple(address to, uint256 amount)"
export type Address = string; // aka HexString of length 42
export type AssetId = string; // aka Address of ERC20 token contract or AddressZero for ETH
export type Bytes32 = string; // aka HexString of length 66
export type DecString = string; // eg "3.14"
export type HexString = string; // eg "0xabc123" of arbitrary length
export type PublicIdentifier = string; // "indra" + base58(<publicKey>)
export type PublicKey = string; // aka HexString of length 132
export type PrivateKey = string; // aka Bytes32
export type SignatureString = string; // aka HexString of length 132
export type UrlString = string; // eg "<protocol>://<host>[:<port>]/<path>

export interface EthSignature {
  r: string;
  s: string;
  v: string;
}

export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
