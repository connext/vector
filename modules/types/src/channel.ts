import { Address } from "./basic";
import { TransferState } from "./transferDefinitions";

// TODO: Use the standard here and replace all non-signer addresses everywhere
export type ContextualAddress = {
  address: Address;
  chainId: number;
};

// TODO: replace these placeholders w real types
export type MultisigCommitment = any;

// Method params
export type SetupParams = {
  counterpartyIdentifier: string;
  timeout: string;
  networkContext: NetworkContext;
};

export type DepositParams = {
  channelAddress: string;
  amount: string; // TODO we actually dont need this?
  assetId: string;
};

export type CreateTransferParams = {
  channelAddress: string;
  amount: string;
  assetId: string;
  transferDefinition: string;
  transferInitialState: TransferState; // TODO (solidityvaluetype?)
  timeout: string;
  encodings: string[]; // [Initial state, resolve state]
  meta?: any;
};

export type ResolveTransferParams = {
  channelAddress: string;
  transferId: string;
  transferResolver: any; // TODO (solidityvaluetype?)
  meta?: any;
};

export const UpdateType = {
  create: "create",
  deposit: "deposit",
  resolve: "resolve",
  setup: "setup",
} as const;
export type UpdateType = typeof UpdateType[keyof typeof UpdateType];

interface ParamsMap {
  [UpdateType.create]: CreateTransferParams;
  [UpdateType.deposit]: DepositParams;
  [UpdateType.resolve]: ResolveTransferParams;
  [UpdateType.setup]: SetupParams;
}

// Protocol update
export type UpdateParams<T extends UpdateType> = {
  channelAddress: string;
  type: T;
  details: ParamsMap[T];
};

// TODO update this in contracts
export type Balance = {
  amount: string[];
  to: Address[];
};

// TODO update this in contracts
export type LockedValueType = {
  amount: string;
};

// Array ordering should always correspond to the channel
// participants array ordering (but value in `to` field may
// not always be the participants addresses)
export interface CoreChannelState {
  channelAddress: Address;
  participants: Address[]; // Signer keys
  timeout: string;
  balances: Balance[]; // initiator, responder
  lockedValue: LockedValueType[]; // Indexed by assetId -- should always be changed in lockstep with transfers
  assetIds: Address[];
  nonce: number;
  latestDepositNonce: number;
  merkleRoot: string;
  meta?: any;
}

export interface CoreTransferState {
  initialBalance: Balance;
  assetId: Address;
  channelAddress: Address;
  transferId: string;
  transferDefinition: Address;
  transferTimeout: string;
  initialStateHash: string;
  transferEncodings: string[]; // Initial state encoding, resolver encoding
  meta?: any;
}

export interface ChannelCommitmentData {
  state: CoreChannelState;
  signatures: string[];
  adjudicatorAddress: Address;
  chainId: number;
}

export interface TransferCommitmentData {
  state: CoreTransferState;
  adjudicatorAddress: Address;
  chainId: number;
  merkleProofData: any; //TODO
}

// Includes any additional info that doesn't need to be sent to chain
export type FullChannelState<T extends UpdateType = any> = CoreChannelState & {
  publicIdentifiers: string[];
  latestUpdate?: ChannelUpdate<T>;
  networkContext: NetworkContext;
};

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
  signatures: string[]; // [from, to]
  // TODO: convention around single signed states?
  // Do the sigs *have* to be an array?
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
  transferInitialState: TransferState; //TODO
  transferEncodings: string[]; // Initial state, resolver state
  merkleProofData: string;
  merkleRoot: string;
};

// NOTE: proof data can be reconstructed, do we need to pass it around?
// what does it mean
export type ResolveUpdateDetails = {
  transferId: string;
  transferDefinition: Address;
  transferResolver: any; //TODO
  transferEncodings: string[]; // Initial state, resolver state
  merkleRoot: string;
};

export type DepositUpdateDetails = {
  latestDepositNonce: number;
};

// TODO: verify these are correct
export type SetupUpdateDetails = {
  timeout: string;
  networkContext: NetworkContext;
};
