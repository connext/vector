import { enumify } from "./utils";

// Method params
export type DepositParams = {
  channelId: string;
  amount: BigNumber;
  assetId: string;
}

export type WithdrawParams = {
  channelId: string;
  amount: BigNumber;
  assetId: string;
  recipient: string;
}

export type CreateTransferParams = {
  channelId: string;
  amount: BigNumber;
  assetId: string;
  transferDefinition: string;
  initialState: TransferState;
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

export type ChannelState = {
    channelId: string;
    participants: string[];
    chainId: string;
    latestNonce: string;
    latestUpdate: ChannelUpdate
};

export type ChannelUpdate = {
  counterpartyPublicIdentifier: string;
  nonce: string;
  type: UpdateType;
  commitment: MultisigCommitment;
};

export const UpdateType = enumify({
    setup: "setup",
    deposit: "deposit",
    withdraw: "withdraw",
    create: "create",
    resolve: "resolve",
});
export type UpdateType = typeof UpdateType[keyof typeof UpdateType];