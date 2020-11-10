import { Address } from "./basic";
import { BalanceEncoding } from "./contracts";
import {
  TransferEncodingsMap,
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
  balance: Balance;
  assetId: string;
  transferDefinition: string;
  transferInitialState: TransferState;
  timeout: string;
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
  address channelAddress,
  address alice,
  address bob,
  address[] assetIds,
  ${BalanceEncoding}[] balances,
  uint256[] processedDepositsA,
  uint256[] processedDepositsB,
  uint256 timeout,
  uint256 nonce,
  bytes32 merkleRoot,
  uint256 defundNonce
)`);

export interface CoreChannelState {
  channelAddress: Address;
  alice: Address;
  bob: Address;
  assetIds: Address[];
  balances: Balance[]; // Indexed by assetId
  processedDepositsA: string[]; // Indexed by assetId
  processedDepositsB: string[]; // Indexed by assetId
  timeout: string;
  nonce: number;
  merkleRoot: string;
  defundNonce: string;
}

// Includes any additional info that doesn't need to be sent to chain
export type FullChannelState<T extends UpdateType = any> = CoreChannelState & {
  aliceIdentifier: string;
  bobIdentifier: string;
  latestUpdate: ChannelUpdate<T>;
  networkContext: NetworkContext;
  inDispute: boolean;
};

export interface ChannelCommitmentData {
  state: CoreChannelState;
  aliceSignature?: string;
  bobSignature?: string;
  channelFactoryAddress: Address;
  chainId: number;
}

export const CoreTransferStateEncoding = tidy(`tuple(
  address channelAddress,
  bytes32 transferId,
  address transferDefinition,
  address initiator,
  address responder,
  address assetId,
  ${BalanceEncoding} balance,
  uint256 transferTimeout,
  bytes32 initialStateHash
)`);
export interface CoreTransferState {
  channelAddress: Address;
  transferId: string;
  transferDefinition: Address;
  initiator: Address; // either alice or bob
  responder: Address; // either alice or bob
  assetId: Address;
  balance: Balance;
  transferTimeout: string;
  initialStateHash: string;
}

export type FullTransferState<T extends TransferName = any> = CoreTransferState & {
  channelFactoryAddress: string; // networkContext?
  chainId: number;
  transferEncodings: typeof TransferEncodingsMap[T]; // Initial state encoding, resolver encoding
  transferState: TransferStateMap[T];
  transferResolver?: TransferResolverMap[T]; // undefined iff not resolved
  meta?: any;
  inDispute: boolean;
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
  transferRegistryAddress: Address;
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

// ChannelUpdateDetails should include everything needed to
// apply an update to the channel synchronously. It is what is
// recieved + validated by an update responder
export interface ChannelUpdateDetailsMap {
  [UpdateType.create]: CreateUpdateDetails;
  [UpdateType.deposit]: DepositUpdateDetails;
  [UpdateType.resolve]: ResolveUpdateDetails;
  [UpdateType.setup]: SetupUpdateDetails;
}

export type CreateUpdateDetails = {
  transferId: string;
  balance: Balance;
  transferDefinition: Address;
  transferTimeout: string;
  transferInitialState: TransferState;
  transferEncodings: string[]; // Included for `applyUpdate`
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
  merkleRoot: string;
  meta?: any;
};

export type DepositUpdateDetails = {
  totalDepositsAlice: string;
  totalDepositsBob: string;
};

export type SetupUpdateDetails = {
  timeout: string;
  networkContext: NetworkContext;
};
