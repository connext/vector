import { InboundChannelError } from "./utils";

// Method params
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
  transferInitialState: any; // TODO (solidityvaluetype?)
  timeout: string;
  encodings: string[]; // [Initial state, resolve state]
};

export type ResolveTransferParams = {
  channelAddress: string;
  transferId: string;
  transferResolver: any; // TODO (solidityvaluetype?)
};

// Protocol update
export type UpdateParams = {
  channelAddress: string;
  type: UpdateType;
  details: DepositParams | CreateTransferParams | ResolveTransferParams;
};

export type Balance = {
  amount: string[];
  to: Address[];
}

export type CoreChannelState = {
  channelAddress: Address;
  participants: Address[]; // Signer keys..?
  timeout: string;
  balances: Balance[] // TODO index by assetId? // initiator, responder
  lockedValue: string[] // Indexed by assetId -- should always be changed in lockstep with transfers
  assetIds: Address[];
  nonce: number;
  latestDepositNonce: number;
  merkleRoot: string;
}

export type CoreTransferState = {
  assetId: Address;
  channelAddress: Address;
  transferId: string;
  transferDefinition: Address;
  transferTimeout: string;
  transferStateHash: string;
  transferEncodings: string[]; // Initial state encoding, resolver encoding
  merkleProofData: any //TODO
}

export type ChannelCommitmentData = {
  state: CoreChannelState;
  signatures: string[];
  adjudicatorAddress: Address;
  chainId: number;
}

export type TransferCommitmentData = {
  state: CoreTransferState;
  adjudicatorAddress: Address;
  chainId: number;
}

// Includes any additional info that doesn't need to be sent to chain
export type FullChannelState = CoreChannelState & {
    publicIdentifiers: string[]
    latestUpdate: ChannelUpdate<any>
    networkContext: NetworkContext;
};

export type NetworkContext = {
  channelFactoryAddress: Address;
  vectorChannelMastercopyAddress: Address;
  chainId: number;
  providerUrl: string;
}

export type ChannelUpdate<T extends UpdateType> = {
  channelAddress: string;
  fromIdentifier: string;
  toIdentifier: string;
  type: T;
  nonce: number;
  balance: Balance;
  assetId: Address;
  details: ChannelUpdateDetailsMap[T]
  signatures: string[]; // [from, to]
};

interface ChannelUpdateDetailsMap {
  [UpdateType.create]: CreateUpdateDetails;
  [UpdateType.deposit]: DepositUpdateDetails;
  [UpdateType.resolve]: ResolveUpdateDetails;
  [UpdateType.setup]: SetupUpdateDetails;
}

type CreateUpdateDetails = {
  transferId: string;
  transferDefinition: Address;
  transferTimeout: string;
  transferInitialState: any; //TODO
  transferEncodings: string[]; // Initial state, resolver state
  merkleProofData: any //TODO
  merkleRoot: string;
}

type ResolveUpdateDetails = {
  transferId: string;
  transferDefinition: Address;
  transferResolver: any; //TODO
  transferEncodings: string[]; // Initial state, resolver state
  merkleProofData: any //TODO
  merkleRoot: string;
}

type DepositUpdateDetails = {
  latestDepositNonce: number;
}

type SetupUpdateDetails = any; //TODO

export const UpdateType = {
  create: "create",
  deposit: "deposit",
  resolve: "resolve",
  setup: "setup",
} as const;
export type UpdateType = typeof UpdateType[keyof typeof UpdateType];

export type VectorChannelMessage = {
  to: string;
  from: string;
  data: any;
};

export type VectorErrorMessage = Omit<VectorChannelMessage, "data"> & {
  error: InboundChannelError;
};

export type VectorMessage = VectorChannelMessage | VectorErrorMessage;

export type Values<E> = E[keyof E];

export interface IStoreService {
  getChannelState(channelAddress: string): Promise<FullChannelState | undefined>;
  saveChannelState(channelState: FullChannelState): Promise<void>;
}

// TODO: fix these interfaces!
export type ILockService = any;
export type IMessagingService = any;
