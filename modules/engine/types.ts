import { BigNumber } from "ethers";
import { InboundChannelError } from "./utils";

// Method params
export type DepositParams = {
  channelId: string;
  amount: BigNumber; // TODO we actually dont need this?
  assetId: string;
};

export type CreateTransferParams = {
  channelId: string;
  amount: BigNumber;
  assetId: string;
  transferDefinition: string;
  initialState: TransferState;
  timeout: BigNumber;
};

export type ResolveTransferParams = {
  channelId: string;
  transferId: string;
  resolver: TransferUpdate;
};

// Protocol update
export type UpdateParams = {
  channelId: string;
  type: UpdateType;
  details: any; //TODO set to one of the above
};

export type ChannelState = {
  channelId: string;
  participants: string[];
  chainId: string;
  latestNonce: string;
  latestUpdate: ChannelUpdate;
};

export type ChannelUpdate = {
  channelId: string;
  counterpartyPublicIdentifier: string;
  nonce: string;
  type: UpdateType;
  commitment: MultisigCommitment;
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
};

export type VectorErrorMessage = Omit<VectorChannelMessage, "data"> & {
  error: InboundChannelError;
};

export type VectorMessage = VectorChannelMessage | VectorErrorMessage;

export type Values<E> = E[keyof E];

export interface IStoreService {
  getChannelState(channelId: string): Promise<ChannelState | undefined>;
  saveChannelState(channelState: ChannelState): Promise<void>;
}

// TODO: fix these interfaces!
export type ILockService = any;
export type IMessagingService = any;
