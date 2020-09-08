import {BigNumber} from "ethers";
import { InboundChannelError } from "./utils";

// Method params
export type DepositParams = {
  channelId: string;
  amount: BigNumber; // TODO we actually dont need this?
  assetId: string;
}

export type CreateTransferParams = {
  channelId: string;
  amount: BigNumber;
  assetId: string;
  transferDefinition: string;
  initialState: TransferState;
  timeout: BigNumber;
}

export type ResolveTransferParams = {
  channelId: string;
  transferId: string;
  resolver: TransferUpdate;
}


// Protocol update
export type UpdateParams = {
  channelId: string;
  type: UpdateType;
  details: any; //TODO set to one of the above
};

export type Balance = {
  amount: BigNumber;
  to: Address;
}

export type NetworkContext = {
  adjudicator: Address;
  multisigMastercopy: Address;
  proxyFactory: Address;
  chainId: number;
}

// This should be the same as the params for disputing the channel
export type ChannelStateCore = {
  // Fixed channel properties
  channelId: Address;
  participants: Address[]; // Signer keys..?
  timeout: BigNumber;
  networkContext: NetworkContext
  // Dynamic channel properties
  balances: Balance[][] // TODO index by assetId? // initiator, responder
  lockedValue: BigNumber[] // Indexed by assetId -- should always be changed in lockstep with transfers
  assetIds: Address[];
  nonce: number;
  latestDepositNonce: number;
  merkleRoot: string;
}

// Includes any additional info that doesn't need to be sent to chain
export type ChannelState = ChannelStateCore & {
    publicIdentifiers: string[]
    latestUpdate: ChannelUpdate
};

//TODO
export type ChannelUpdate = {
  channelId: string;
  counterpartyPublicIdentifier: string;
  nonce: number;
  type: UpdateType;
};

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
}
export type VectorErrorMessage = Omit<VectorChannelMessage, "data"> & {error: InboundChannelError}
export type VectorMessage = VectorChannelMessage | VectorErrorMessage;

export type Values<E> = E[keyof E];

export interface IStoreService {
  getChannelState(channelId: string): Promise<ChannelState | undefined>
  saveChannelState(channelState: ChannelState): Promise<void>
};


// TODO: fix these interfaces!
export type ILockService = any;
export type IMessagingService = any
