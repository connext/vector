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
};

export type ResolveTransferParams = {
  channelId: string;
  transferId: string;
  resolver: TransferUpdate;
};
//////

export interface IWalletService {
  getPublicIdentifier(): string;
  setup(params: SetupParams): Promise<void>;
  deposit(params: DepositParams): Promise<void>;
  create(params: CreateTransferParams): Promise<void>;
  resolve(params: ResolveTransferParams): Promise<void>;
  withdraw(params: unknown): Promise<void>;
}
