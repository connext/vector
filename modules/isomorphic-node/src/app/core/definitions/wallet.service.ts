import { BigNumber } from "ethers";

// TODO: import
export type CoinTransfers = [
  {
    to: string;
    amount: BigNumber;
  },
  {
    to: string;
    amount: BigNumber;
  },
];

export type TransferState = CoinTransfers;
export type TransferUpdate = {
  preImage: string;
};

export type SetupParams = {
  channelId: string;
  participants: string[];
  chainId: number;
};

export type DepositParams = {
  channelId: string;
  amount: BigNumber;
  assetId: string;
};

export type CreateTransferParams = {
  channelId: string;
  amount: BigNumber;
  assetId: string;
  transferDefinition: string;
  initialState: TransferState;
  timeout: BigNumber;
  meta?: Record<string, unknown>;
};

export type ResolveTransferParams = {
  channelId: string;
  transferId: string;
  resolver: TransferUpdate;
};

export type ChannelState = {
  channelId: string;
  participants: string[];
  chainId: string;
  latestNonce: string;
  latestUpdate?: ChannelUpdate;
};

export type ChannelUpdate = {
  channelId: string;
  counterpartyPublicIdentifier: string;
  nonce: string;
  type: UpdateType;
  commitment: unknown;
};

export const UpdateType = {
  create: 'create',
  deposit: 'deposit',
  resolve: 'resolve',
  setup: 'setup',
} as const;
export type UpdateType = typeof UpdateType[keyof typeof UpdateType];

//////

export interface IWalletService {
  getPublicIdentifier(): string;
  getSignerAddress(): string;
  setup(params: SetupParams): Promise<ChannelState>;
  deposit(params: DepositParams): Promise<ChannelState>;
  create(params: CreateTransferParams): Promise<ChannelState>;
  resolve(params: ResolveTransferParams): Promise<ChannelState>;
  withdraw(params: unknown): Promise<ChannelState>;
  getChannel(channelId: string): Promise<ChannelState | undefined>;
}
