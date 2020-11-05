import { FullChannelState, FullTransferState } from "./channel";
import { EngineParams } from "./schemas";

export const ChannelRpcMethods = {
  chan_getChannelState: "chan_getChannelState",
  chan_getChannelStateByParticipants: "chan_getChannelStateByParticipants",
  chan_getChannelStates: "chan_getChannelStates",
  chan_getTransferStateByRoutingId: "chan_getTransferStateByRoutingId",
  chan_getTransferStatesByRoutingId: "chan_getTransferStatesByRoutingId",
  chan_getActiveTransfers: "chan_getActiveTransfers",
  chan_getTransferState: "chan_getTransferState",
  chan_setup: "chan_setup",
  chan_requestSetup: "chan_requestSetup",
  chan_deposit: "chan_deposit",
  chan_requestCollateral: "chan_requestCollateral",
  chan_createTransfer: "chan_createTransfer",
  chan_resolveTransfer: "chan_resolveTransfer",
  chan_withdraw: "chan_withdraw",
  chan_subscribe: "chan_subscribe",
  chan_unsubscribeAll: "chan_unsubscribeAll",
  connext_authenticate: "connext_authenticate",
} as const;
export type ChannelRpcMethod = typeof ChannelRpcMethods[keyof typeof ChannelRpcMethods];

export type ChannelRpcMethodsPayloadMap = {
  [ChannelRpcMethods.chan_getChannelState]: EngineParams.GetChannelState;
  [ChannelRpcMethods.chan_getChannelStateByParticipants]: EngineParams.GetChannelStateByParticipants;
  [ChannelRpcMethods.chan_getTransferStateByRoutingId]: EngineParams.GetTransferStateByRoutingId;
  [ChannelRpcMethods.chan_getTransferStatesByRoutingId]: EngineParams.GetTransferStatesByRoutingId;
  [ChannelRpcMethods.chan_getActiveTransfers]: EngineParams.GetActiveTransfers;
  [ChannelRpcMethods.chan_getTransferState]: EngineParams.GetTransferState;
  [ChannelRpcMethods.chan_getChannelStates]: undefined;
  [ChannelRpcMethods.chan_setup]: EngineParams.Setup;
  [ChannelRpcMethods.chan_requestSetup]: EngineParams.Setup;
  [ChannelRpcMethods.chan_deposit]: EngineParams.Deposit;
  [ChannelRpcMethods.chan_requestCollateral]: EngineParams.Deposit;
  [ChannelRpcMethods.chan_createTransfer]: EngineParams.ConditionalTransfer;
  [ChannelRpcMethods.chan_resolveTransfer]: EngineParams.ResolveTransfer;
  [ChannelRpcMethods.chan_withdraw]: EngineParams.Withdraw;
  [ChannelRpcMethods.chan_subscribe]: { event: string; once: boolean };
  [ChannelRpcMethods.chan_unsubscribeAll]: undefined;
  [ChannelRpcMethods.connext_authenticate]: { signature: string };
};

export type ChannelRpcMethodsResponsesMap = {
  [ChannelRpcMethods.chan_getChannelState]: FullChannelState | undefined;
  [ChannelRpcMethods.chan_getChannelStateByParticipants]: FullChannelState | undefined;
  [ChannelRpcMethods.chan_getChannelStates]: FullChannelState[];
  [ChannelRpcMethods.chan_getTransferStateByRoutingId]: FullTransferState | undefined;
  [ChannelRpcMethods.chan_getTransferStatesByRoutingId]: FullTransferState[];
  [ChannelRpcMethods.chan_getActiveTransfers]: FullTransferState[];
  [ChannelRpcMethods.chan_getTransferState]: FullTransferState | undefined;
  [ChannelRpcMethods.chan_setup]: FullChannelState;
  [ChannelRpcMethods.chan_requestSetup]: FullChannelState;
  [ChannelRpcMethods.chan_deposit]: FullChannelState;
  [ChannelRpcMethods.chan_requestCollateral]: FullChannelState;
  [ChannelRpcMethods.chan_createTransfer]: FullChannelState;
  [ChannelRpcMethods.chan_resolveTransfer]: FullChannelState;
  [ChannelRpcMethods.chan_withdraw]: { channel: FullChannelState; transactionHash?: string };
  [ChannelRpcMethods.chan_subscribe]: any;
  [ChannelRpcMethods.chan_unsubscribeAll]: any;
  [ChannelRpcMethods.connext_authenticate]: { publicIdentifier: string; signerAddress: string };
};
