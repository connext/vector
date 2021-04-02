export type ChannelDispute = {
  channelStateHash: string;
  nonce: string;
  merkleRoot: string;
  consensusExpiry: string;
  defundExpiry: string;
};

export type TransferDispute = {
  transferId: string; // From events
  transferStateHash: string;
  transferDisputeExpiry: string;
  isDefunded: boolean;
};
