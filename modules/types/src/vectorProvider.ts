export const ChannelRpcMethods = {
  chan_setup: "chan_setup",
  chan_deposit: "chan_deposit",
  chan_createTransfer: "chan_createTransfer",
  chan_resolveTransfer: "chan_resolveTransfer",
  chan_getChannelState: "chan_getChannelState",
} as const;
export type ChannelRpcMethods = typeof ChannelRpcMethods[keyof typeof ChannelRpcMethods];
