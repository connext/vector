import { enumify } from "./utils";

export type UpdateParams = {
  channelId: string;
  type: UpdateType;
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
