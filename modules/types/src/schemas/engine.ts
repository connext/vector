////////////////////////////////////////

import { Static, TStringLiteral, Type } from "@sinclair/typebox";

import { ChannelRpcMethod, ChannelRpcMethods } from "../vectorProvider";

import {
  TBasicMeta,
  TAddress,
  TBytes32,
  TPublicIdentifier,
  TChainId,
  TIntegerString,
  TransferResolverSchema,
} from "./basic";

////////////////////////////////////////
// Engine API Parameter schemas

// The engine takes in user-friendly channel transition parameters
// from the rpc, converts them to proper protocol parameters,
// and returns the protocol response.

// Get transfer state by resolver id params
const GetTransferStateByRoutingIdParamsSchema = Type.Object({
  channelAddress: TAddress,
  routingId: TBytes32,
});

const GetTransferStatesByRoutingIdParamsSchema = Type.Object({
  routingId: TBytes32,
});

// Get channel state params
const GetChannelStateParamsSchema = Type.Object({ channelAddress: TAddress });

// Get channel states params
const GetChannelStatesParamsSchema = Type.Object({});

// Get channel state by participants params
const GetChannelStateByParticipantsParamsSchema = Type.Object({
  alice: TPublicIdentifier,
  bob: TPublicIdentifier,
  chainId: TChainId,
});

// Returns all active transfers for the channel
const GetActiveTransfersParamsSchema = Type.Object({
  channelAddress: TAddress,
});

// Returns the transfer associated with the transferID
const GetTransferStateParamsSchema = Type.Object({
  transferId: TBytes32,
});

// Setup engine params
const SetupEngineParamsSchema = Type.Object({
  counterpartyIdentifier: TPublicIdentifier,
  chainId: TChainId,
  timeout: TIntegerString,
  meta: TBasicMeta,
});

// Deposit engine params
const DepositEngineParamsSchema = Type.Object({
  channelAddress: TAddress,
  assetId: TAddress,
  meta: TBasicMeta,
});

// Create conditional transfer engine params
const CreateConditionalTransferParamsSchema = Type.Object({
  channelAddress: TAddress,
  amount: TIntegerString,
  assetId: TAddress,
  recipient: Type.Optional(TPublicIdentifier),
  recipientChainId: Type.Optional(TChainId),
  recipientAssetId: Type.Optional(TAddress),
  timeout: Type.Optional(TIntegerString),
  meta: TBasicMeta,
  type: Type.String(), // Type.Union([TransferNameSchema, TAddress]),
  details: Type.Any(), // initial state w.o balance object
});

// Resolve conditional transfer engine params
const ResolveTransferParamsSchema = Type.Object({
  channelAddress: TAddress,
  transferId: TBytes32,
  meta: TBasicMeta,
  transferResolver: TransferResolverSchema,
});

// Withdraw engine params
const WithdrawParamsSchema = Type.Object({
  channelAddress: TAddress,
  amount: TIntegerString,
  assetId: TAddress,
  recipient: TAddress,
  fee: Type.Optional(TIntegerString),
  meta: TBasicMeta,
});

// Rpc request schema
const RpcRequestEngineParamsSchema = Type.Object({
  id: Type.Number({ minimum: 1 }),
  jsonrpc: Type.Literal("2.0"),
  method: Type.Union(
    Object.values(ChannelRpcMethods).map(methodName => Type.Literal(methodName)) as [TStringLiteral<ChannelRpcMethod>],
  ),
  params: Type.Optional(Type.Any()),
  // NOTE: Safe to make params an object here, in engine the
  // params will be validated after the method is dispatched
});

// Namespace export
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EngineParams {
  export const RpcRequestSchema = RpcRequestEngineParamsSchema;
  export type RpcRequest = Static<typeof RpcRequestEngineParamsSchema>;

  export const GetTransferStateByRoutingIdSchema = GetTransferStateByRoutingIdParamsSchema;
  export type GetTransferStateByRoutingId = Static<typeof GetTransferStateByRoutingIdParamsSchema>;

  export const GetTransferStatesByRoutingIdSchema = GetTransferStatesByRoutingIdParamsSchema;
  export type GetTransferStatesByRoutingId = Static<typeof GetTransferStatesByRoutingIdParamsSchema>;

  export const GetChannelStatesSchema = GetChannelStatesParamsSchema;
  export type GetChannelStates = Static<typeof GetChannelStatesSchema>;

  export const GetChannelStateSchema = GetChannelStateParamsSchema;
  export type GetChannelState = Static<typeof GetChannelStateSchema>;

  export const GetChannelStateByParticipantsSchema = GetChannelStateByParticipantsParamsSchema;
  export type GetChannelStateByParticipants = Static<typeof GetChannelStateByParticipantsSchema>;

  export const GetActiveTransfersSchema = GetActiveTransfersParamsSchema;
  export type GetActiveTransfers = Static<typeof GetActiveTransfersParamsSchema>;

  export const GetTransferStateSchema = GetTransferStateParamsSchema;
  export type GetTransferState = Static<typeof GetTransferStateParamsSchema>;

  export const SetupSchema = SetupEngineParamsSchema;
  export type Setup = Static<typeof SetupEngineParamsSchema>;

  export const DepositSchema = DepositEngineParamsSchema;
  export type Deposit = Static<typeof DepositEngineParamsSchema>;

  export const ConditionalTransferSchema = CreateConditionalTransferParamsSchema;
  export type ConditionalTransfer = Static<typeof CreateConditionalTransferParamsSchema>;

  export const ResolveTransferSchema = ResolveTransferParamsSchema;
  export type ResolveTransfer = Static<typeof ResolveTransferParamsSchema>;

  export const WithdrawSchema = WithdrawParamsSchema;
  export type Withdraw = Static<typeof WithdrawSchema>;
}
