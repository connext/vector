////////////////////////////////////////

import { Static, TStringLiteral, Type } from "@sinclair/typebox";

import { ChannelRpcMethod, ChannelRpcMethods } from "../vectorProvider";
import { TransferName } from "../transferDefinitions";

import {
  LinkedTransferResolverSchema,
  TBasicMeta,
  TAddress,
  TBytes32,
  TPublicIdentifier,
  TChainId,
  TIntegerString,
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
const BasicConditionalTransferParamsSchema = Type.Object({
  channelAddress: TAddress,
  amount: TIntegerString,
  assetId: TAddress,
  recipient: Type.Optional(TPublicIdentifier),
  recipientChainId: Type.Optional(TChainId),
  recipientAssetId: Type.Optional(TAddress),
  timeout: Type.Optional(TIntegerString),
  meta: TBasicMeta,
});

const LinkedTransferCreateDetailsSchema = Type.Object({
  conditionType: Type.Literal(TransferName.LinkedTransfer),
  details: Type.Object({
    linkedHash: TBytes32,
  }),
});

const CreateLinkedTransferParamsSchema = Type.Intersect([
  BasicConditionalTransferParamsSchema,
  LinkedTransferCreateDetailsSchema,
]);
// TODO: resolves to any, revisit when we have more conditional transfers
// const ConditionalTransferParamsSchema = Type.Union([LinkedTransferParamsSchema]);

// Resolve conditional transfer engine params
const BasicResolveTransferParamsSchema = Type.Object({
  channelAddress: TAddress,
  transferId: TBytes32,
  meta: TBasicMeta,
});

const LinkedTransferResolveDetailsSchema = Type.Object({
  conditionType: Type.Literal(TransferName.LinkedTransfer),
  details: LinkedTransferResolverSchema,
});

const ResolveLinkedTransferParamsSchema = Type.Intersect([
  BasicResolveTransferParamsSchema,
  LinkedTransferResolveDetailsSchema,
]);

// // TODO: resolves to any, revisit when we have more conditional transfers
// const ResolveTransferParamsSchema = Type.Union([ResolveLinkedTransferParamsSchema]);

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

  export const GetChannelStatesSchema = GetChannelStatesParamsSchema;
  export type GetChannelStates = Static<typeof GetChannelStatesSchema>;

  export const GetChannelStateSchema = GetChannelStateParamsSchema;
  export type GetChannelState = Static<typeof GetChannelStateSchema>;

  export const GetChannelStateByParticipantsSchema = GetChannelStateByParticipantsParamsSchema;
  export type GetChannelStateByParticipants = Static<typeof GetChannelStateByParticipantsSchema>;

  export const SetupSchema = SetupEngineParamsSchema;
  export type Setup = Static<typeof SetupEngineParamsSchema>;

  export const DepositSchema = DepositEngineParamsSchema;
  export type Deposit = Static<typeof DepositEngineParamsSchema>;

  // TODO: see note re: grouping transfer typings
  export const ConditionalTransferSchema = CreateLinkedTransferParamsSchema;
  export type ConditionalTransfer = Static<typeof CreateLinkedTransferParamsSchema>;

  // TODO: see note re: grouping transfer typings
  export const ResolveTransferSchema = ResolveLinkedTransferParamsSchema;
  export type ResolveTransfer = Static<typeof ResolveLinkedTransferParamsSchema>;

  export const WithdrawSchema = WithdrawParamsSchema;
  export type Withdraw = Static<typeof WithdrawSchema>;
}
