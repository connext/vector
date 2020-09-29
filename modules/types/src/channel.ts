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
  channelAddress: string; // TODO: does this need to be in the details AND params?
  amount: string;
  assetId: string;
  transferDefinition: string;
  transferInitialState: TransferState;
  timeout: string;
  encodings: string[]; // [Initial state, resolve state]
  meta?: any;
};

export type ResolveTransferParams = {
  channelAddress: string; // TODO: does this need to be in the details AND params?
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
  address[] assetIds,
  address channelAddress,
  address alice,
  address bob,
  uint256[] processedDepositsA,
  uint256[] processedDepositsB,
  uint256 timeout,
  uint256 nonce,
  bytes32 merkleRoot
)`);

export interface CoreChannelState {
  assetIds: Address[];
  balances: Balance[]; // Indexed by assetId
  channelAddress: Address;
  merkleRoot: string;
  nonce: number;
  alice: Address;
  bob: Address;
  processedDepositsA: string[]; // Indexed by assetId
  processedDepositsB: string[]; // Indexed by assetId
  timeout: string;
}

// Includes any additional info that doesn't need to be sent to chain
export type FullChannelState<T extends UpdateType = any> = CoreChannelState & {
  aliceIdentifier: string;
  bobIdentifier: string;
  latestUpdate: ChannelUpdate<T>;
  networkContext: NetworkContext;
};

export interface ChannelCommitmentData {
  state: CoreChannelState;
  aliceSignature?: string;
  bobSignature?: string;
  channelFactoryAddress: Address;
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
  initiator: Address; // either alice or bob
  responder: Address; // either alice or bob
}

export type FullTransferState<T extends TransferName = any> = CoreTransferState & {
  channelFactoryAddress: string; // networkContext?
  chainId: number;
  transferEncodings: string[]; // Initial state encoding, resolver encoding
  transferState: TransferStateMap[T];
  transferResolver?: TransferResolverMap[T]; // undefined iff not resolved
  meta?: any;
};

export interface TransferCommitmentData {
  state: CoreTransferState;
  channelFactoryAddress: Address;
  chainId: number;
  merkleProofData: string[];
}

export type ChainAddresses = {
  [chainId: number]: ContractAddresses;
};

export type ContractAddresses = {
  channelFactoryAddress: Address;
  channelMastercopyAddress: Address;
  withdrawDefinition?: Address;
  linkedTransferDefinition?: Address;
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
  aliceSignature?: string;
  bobSignature?: string;
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
  totalDepositedA: string;
  totalDepositedB: string;
};

export type SetupUpdateDetails = {
  timeout: string;
  networkContext: NetworkContext;
};
