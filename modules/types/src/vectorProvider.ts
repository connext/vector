import { FullTransferState, FullChannelState } from "./channel";
import { ChainProviders } from "./network";
import { EngineParams, NodeResponses } from "./schemas";
import { RegisteredTransfer } from "./transferDefinitions";

export const ChannelRpcMethods = {
  chan_signUtilityMessage: "chan_signUtilityMessage",
  chan_getConfig: "chan_getConfig",
  chan_getRouterConfig: "chan_getRouterConfig",
  chan_getStatus: "chan_getStatus",
  chan_getChannelState: "chan_getChannelState",
  chan_getChannelStateByParticipants: "chan_getChannelStateByParticipants",
  chan_getChannelStates: "chan_getChannelStates",
  chan_getTransferStateByRoutingId: "chan_getTransferStateByRoutingId",
  chan_getTransferStatesByRoutingId: "chan_getTransferStatesByRoutingId",
  chan_getActiveTransfers: "chan_getActiveTransfers",
  chan_getRegisteredTransfers: "chan_getRegisteredTransfers",
  chan_getTransferState: "chan_getTransferState",
  chan_setup: "chan_setup",
  chan_sendIsAlive: "chan_sendIsAlive",
  chan_requestSetup: "chan_requestSetup",
  chan_deposit: "chan_deposit",
  chan_requestCollateral: "chan_requestCollateral",
  chan_createTransfer: "chan_createTransfer",
  chan_resolveTransfer: "chan_resolveTransfer",
  chan_restoreState: "chan_restoreState",
  chan_withdraw: "chan_withdraw",
  chan_subscribe: "chan_subscribe",
  chan_unsubscribe: "chan_unsubscribe",
  chan_unsubscribeAll: "chan_unsubscribeAll",
  connext_authenticate: "connext_authenticate",
  chan_dispute: "chan_dispute",
  chan_defund: "chan_defund",
  chan_disputeTransfer: "chan_disputeTransfer",
  chan_defundTransfer: "chan_defundTransfer",
  chan_decrypt: "chan_decrypt",
  chan_subscription: "chan_subscription",
} as const;
export type ChannelRpcMethod = typeof ChannelRpcMethods[keyof typeof ChannelRpcMethods];

export type ChannelRpcMethodsPayloadMap = {
  [ChannelRpcMethods.chan_signUtilityMessage]: EngineParams.SignUtilityMessage;
  [ChannelRpcMethods.chan_getConfig]: {};
  [ChannelRpcMethods.chan_getRouterConfig]: EngineParams.GetRouterConfig;
  [ChannelRpcMethods.chan_getStatus]: {};
  [ChannelRpcMethods.chan_sendIsAlive]: EngineParams.SendIsAlive;
  [ChannelRpcMethods.chan_getChannelState]: EngineParams.GetChannelState;
  [ChannelRpcMethods.chan_getChannelStateByParticipants]: EngineParams.GetChannelStateByParticipants;
  [ChannelRpcMethods.chan_getTransferStateByRoutingId]: EngineParams.GetTransferStateByRoutingId;
  [ChannelRpcMethods.chan_getTransferStatesByRoutingId]: EngineParams.GetTransferStatesByRoutingId;
  [ChannelRpcMethods.chan_getActiveTransfers]: EngineParams.GetActiveTransfers;
  [ChannelRpcMethods.chan_getTransferState]: EngineParams.GetTransferState;
  [ChannelRpcMethods.chan_getRegisteredTransfers]: EngineParams.GetRegisteredTransfers;
  [ChannelRpcMethods.chan_getChannelStates]: {};
  [ChannelRpcMethods.chan_setup]: EngineParams.Setup;
  [ChannelRpcMethods.chan_requestSetup]: EngineParams.Setup;
  [ChannelRpcMethods.chan_deposit]: EngineParams.Deposit;
  [ChannelRpcMethods.chan_requestCollateral]: EngineParams.Deposit;
  [ChannelRpcMethods.chan_createTransfer]: EngineParams.ConditionalTransfer;
  [ChannelRpcMethods.chan_resolveTransfer]: EngineParams.ResolveTransfer;
  [ChannelRpcMethods.chan_restoreState]: EngineParams.RestoreState;
  [ChannelRpcMethods.chan_withdraw]: EngineParams.Withdraw;
  [ChannelRpcMethods.chan_subscribe]: { event: string; once: boolean };
  [ChannelRpcMethods.chan_unsubscribe]: { event: string };
  [ChannelRpcMethods.chan_unsubscribeAll]: {};
  [ChannelRpcMethods.connext_authenticate]: { signature?: string; chainProviders: ChainProviders };
  [ChannelRpcMethods.chan_dispute]: EngineParams.DisputeChannel;
  [ChannelRpcMethods.chan_defund]: EngineParams.DefundChannel;
  [ChannelRpcMethods.chan_disputeTransfer]: EngineParams.DisputeTransfer;
  [ChannelRpcMethods.chan_defundTransfer]: EngineParams.DefundTransfer;
  [ChannelRpcMethods.chan_decrypt]: string;
  [ChannelRpcMethods.chan_subscription]: {
    subscription: string;
    data: any;
  };
};

export type ChannelRpcMethodsResponsesMap = {
  [ChannelRpcMethods.chan_signUtilityMessage]: string;
  [ChannelRpcMethods.chan_getConfig]: NodeResponses.GetConfig;
  [ChannelRpcMethods.chan_getRouterConfig]: NodeResponses.GetRouterConfig;
  [ChannelRpcMethods.chan_getStatus]: NodeResponses.GetStatus;
  [ChannelRpcMethods.chan_sendIsAlive]: NodeResponses.SendIsAlive;
  [ChannelRpcMethods.chan_getChannelState]: FullChannelState | undefined;
  [ChannelRpcMethods.chan_getChannelStateByParticipants]: FullChannelState | undefined;
  [ChannelRpcMethods.chan_getChannelStates]: FullChannelState[];
  [ChannelRpcMethods.chan_getTransferStateByRoutingId]: FullTransferState | undefined;
  [ChannelRpcMethods.chan_getTransferStatesByRoutingId]: FullTransferState[];
  [ChannelRpcMethods.chan_getActiveTransfers]: FullTransferState[];
  [ChannelRpcMethods.chan_getTransferState]: FullTransferState | undefined;
  [ChannelRpcMethods.chan_getRegisteredTransfers]: RegisteredTransfer[];
  [ChannelRpcMethods.chan_setup]: FullChannelState;
  [ChannelRpcMethods.chan_requestSetup]: FullChannelState;
  [ChannelRpcMethods.chan_deposit]: FullChannelState;
  [ChannelRpcMethods.chan_requestCollateral]: FullChannelState;
  [ChannelRpcMethods.chan_createTransfer]: FullChannelState;
  [ChannelRpcMethods.chan_resolveTransfer]: FullChannelState;
  [ChannelRpcMethods.chan_restoreState]: FullChannelState;
  [ChannelRpcMethods.chan_withdraw]: { channel: FullChannelState; transactionHash?: string };
  [ChannelRpcMethods.chan_subscribe]: any;
  [ChannelRpcMethods.chan_unsubscribe]: void;
  [ChannelRpcMethods.chan_unsubscribeAll]: any;
  [ChannelRpcMethods.connext_authenticate]: {
    publicIdentifier: string;
    signerAddress: string;
  };
  [ChannelRpcMethods.chan_dispute]: { transactionHash: string };
  [ChannelRpcMethods.chan_defund]: { transactionHash: string };
  [ChannelRpcMethods.chan_disputeTransfer]: { transactionHash: string };
  [ChannelRpcMethods.chan_defundTransfer]: { transactionHash: string };
  [ChannelRpcMethods.chan_decrypt]: string;
  [ChannelRpcMethods.chan_subscription]: any;
};
