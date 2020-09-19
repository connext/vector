import { Address } from "./basic";
import { BalanceEncoding } from "./contracts";
import {
  TransferName,
  TransferResolver,
  TransferResolverMap,
  TransferState,
  TransferStateMap,
} from "./transferDefinitions";
import { tidy } from "./utils";

// TODO: Use the standard here and replace all non-signer addresses everywhere
export type ContextualAddress = {
  address: Address;
  chainId: number;
};

// Method params
export type SetupParams = {
  counterpartyIdentifier: string;
  timeout: string;
  networkContext: NetworkContext;
};

export type DepositParams = {
  channelAddress: string;
  assetId: string;
};

export type CreateTransferParams = {
  channelAddress: string;
  amount: string;
  assetId: string;
  transferDefinition: string;
  transferInitialState: TransferState;
  timeout: string;
  encodings: string[]; // [Initial state, resolve state]
  meta?: any;
};

export type ResolveTransferParams = {
  channelAddress: string;
  transferId: string;
  transferResolver: TransferResolver;
  meta?: any;
};

export const UpdateType = {
  create: "create",
  deposit: "deposit",
  resolve: "resolve",
  setup: "setup",
} as const;
export type UpdateType = typeof UpdateType[keyof typeof UpdateType];

export interface UpdateParamsMap {
  [UpdateType.create]: CreateTransferParams;
  [UpdateType.deposit]: DepositParams;
  [UpdateType.resolve]: ResolveTransferParams;
  [UpdateType.setup]: SetupParams;
}

// Protocol update
export type UpdateParams<T extends UpdateType> = {
  channelAddress: string;
  type: T;
  details: UpdateParamsMap[T];
};

export type Balance = {
  amount: string[];
  to: Address[];
};

export const CoreChannelStateEncoding = tidy(`tuple(
  ${BalanceEncoding}[] balances,
  uint256[] lockedBalance,
  address[] assetIds,
  address channelAddress,
  address[] participants,
  uint256 timeout,
  uint256 nonce,
  uint256 latestDepositNonce,
  bytes32 merkleRoot
)`);

// Array ordering should always correspond to the channel
// participants array ordering (but value in `to` field may
// not always be the participants addresses)
export interface CoreChannelState {
  channelAddress: Address;
  participants: Address[]; // Signer keys
  timeout: string;
  balances: Balance[]; // Indexed by assetId
  lockedBalance: string[]; // Indexed by assetId -- should always be changed in lockstep with transfers
  assetIds: Address[];
  nonce: number;
  latestDepositNonce: number;
  merkleRoot: string;
}

// Includes any additional info that doesn't need to be sent to chain
export type FullChannelState<T extends UpdateType = any> = CoreChannelState & {
  publicIdentifiers: string[];
  latestUpdate: ChannelUpdate<T>;
  networkContext: NetworkContext;
};

export interface ChannelCommitmentData {
  state: CoreChannelState;
  signatures: string[];
  adjudicatorAddress: Address;
  chainId: number;
}

export interface CoreTransferState {
  initialBalance: Balance;
  assetId: Address;
  channelAddress: Address;
  transferId: string;
  transferDefinition: Address;
  transferTimeout: string;
  initialStateHash: string;
}

export type FullTransferState<T extends TransferName = any> = CoreTransferState & {
  adjudicatorAddress: string; // networkContext?
  chainId: number;
  transferEncodings: string[]; // Initial state encoding, resolver encoding
  transferState: TransferStateMap[T];
  transferResolver?: TransferResolverMap[T]; // undefined iff not resolved
  meta?: any;
};

export interface TransferCommitmentData {
  state: CoreTransferState;
  adjudicatorAddress: Address;
  chainId: number;
  merkleProofData: string[];
}

export type ChainAddresses = {
  [chainId: number]: ContractAddresses;
};

export type ContractAddresses = {
  channelFactoryAddress: Address;
  vectorChannelMastercopyAddress: Address;
  adjudicatorAddress: Address;
  linkedTransferDefinition?: Address;
  withdrawDefinition?: Address;
};

export type NetworkContext = ContractAddresses & {
  chainId: number;
  providerUrl: string;
};

export type ChannelUpdate<T extends UpdateType> = {
  channelAddress: string;
  fromIdentifier: string;
  toIdentifier: string;
  type: T;
  nonce: number;
  balance: Balance;
  assetId: Address;
  details: ChannelUpdateDetailsMap[T];
  signatures: string[]; // same participants ordering
};

export interface ChannelUpdateDetailsMap {
  [UpdateType.create]: CreateUpdateDetails;
  [UpdateType.deposit]: DepositUpdateDetails;
  [UpdateType.resolve]: ResolveUpdateDetails;
  [UpdateType.setup]: SetupUpdateDetails;
}

export type CreateUpdateDetails = {
  transferId: string;
  transferDefinition: Address;
  transferTimeout: string;
  transferInitialState: TransferState;
  transferEncodings: string[]; // Initial state, resolver state
  merkleProofData: string[];
  merkleRoot: string;
  meta?: any;
};

// NOTE: proof data can be reconstructed, do we need to pass it around?
// what does it mean
export type ResolveUpdateDetails = {
  transferId: string;
  transferDefinition: Address;
  transferResolver: TransferResolver;
  transferEncodings: string[]; // Initial state, resolver state
  merkleRoot: string;
  meta?: any;
};

export type DepositUpdateDetails = {
  latestDepositNonce: number;
};

export type SetupUpdateDetails = {
  timeout: string;
  networkContext: NetworkContext;
};
