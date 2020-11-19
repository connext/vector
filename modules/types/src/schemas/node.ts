import { Static, TStringLiteral, Type } from "@sinclair/typebox";

import { EngineEvent, EngineEvents } from "../engine";

import { EngineParams } from "./engine";
import {
  TUrl,
  TAddress,
  TPublicIdentifier,
  TIntegerString,
  TBytes32,
  TFullTransferState,
  TFullChannelState,
  TChainId,
} from "./basic";

////////////////////////////////////////
// Server Node API Parameter schemas

// The server node serves as a thin REST-based wrapper around
// the engine. It will take in HTTP requests, and make the
// appropriate engine rpc calls

// Shared type for all successful channel actions
const BasicChannelServerResponseSchema = {
  200: Type.Object({
    channelAddress: TAddress,
  }),
};

// Shared type for all successful transfer actions
const BasicTransferServerResponseSchema = {
  200: Type.Object({
    channelAddress: TAddress,
    transferId: TBytes32,
    routingId: Type.Optional(TBytes32),
  }),
};

// GET TRANSFER BY ROUTINGID
const GetTransferStateByRoutingIdParamsSchema = Type.Intersect([
  EngineParams.GetTransferStateByRoutingIdSchema,
  Type.Object({
    publicIdentifier: TPublicIdentifier,
  }),
]);

const GetTransferStateByRoutingIdResponseSchema = {
  200: Type.Union([Type.Undefined, TFullTransferState]),
};

// GET TRANSFERS BY ROUTINGID
const GetTransferStatesByRoutingIdParamsSchema = Type.Intersect([
  EngineParams.GetTransferStatesByRoutingIdSchema,
  Type.Object({
    publicIdentifier: TPublicIdentifier,
  }),
]);

const GetTransferStatesByRoutingIdResponseSchema = {
  200: Type.Array(TFullTransferState),
};

// GET ACTIVE TRANSFERS BY ADDR
const GetActiveTransfersByChannelAddressParamsSchema = Type.Intersect([
  EngineParams.GetActiveTransfersSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const GetActiveTransfersByChannelAddressResponseSchema = {
  200: Type.Array(TFullTransferState),
};

// GET TRANSFERS BY TRANSFERID
const GetTransferStateParamsSchema = Type.Intersect([
  EngineParams.GetTransferStateSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const GetTransferStateResponseSchema = {
  200: Type.Union([Type.Undefined, TFullTransferState]),
};

// GET CHANNEL STATE
const GetChannelStateParamsSchema = Type.Intersect([
  EngineParams.GetChannelStateSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const GetChannelStateResponseSchema = {
  200: Type.Union([Type.Undefined, TFullChannelState]),
};

// GET CHANNEL STATES
const GetChannelStatesParamsSchema = Type.Intersect([
  EngineParams.GetChannelStatesSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const GetChannelStatesResponseSchema = {
  200: Type.Array(TAddress),
};

// GET CHANNEL STATE BY PARTICIPANTS
const GetChannelStateByParticipantsParamsSchema = Type.Object({
  publicIdentifier: TPublicIdentifier,
  counterparty: TPublicIdentifier,
  chainId: TChainId,
});

const GetChannelStateByParticipantsResponseSchema = GetChannelStateResponseSchema;

// GET CONFIG
const GetConfigResponseSchema = {
  200: Type.Array(
    Type.Object({
      publicIdentifier: TPublicIdentifier,
      signerAddress: TAddress,
      index: Type.Integer(),
    }),
  ),
};

// GET LISTENER
const GetListenerParamsSchema = Type.Object({
  eventName: Type.Union(Object.values(EngineEvents).map(e => Type.Literal(e)) as [TStringLiteral<EngineEvent>]),
  publicIdentifier: TPublicIdentifier,
});

const GetListenerResponseSchema = {
  200: Type.Object({ url: TUrl }),
};

// GET LISTENERS
const GetListenersParamsSchema = Type.Object({ publicIdentifier: TPublicIdentifier });

const GetListenersResponseSchema = {
  200: Type.Map(TUrl),
};

// REGISTER LISTENER
const PostRegisterListenerBodySchema = Type.Object({
  publicIdentifier: TPublicIdentifier,
  events: Type.Map(Type.String()),
});

const PostRegisterListenerResponseSchema = {
  200: Type.Object({
    message: Type.String(),
  }),
};

// POST SETUP
const PostSetupBodySchema = Type.Intersect([
  EngineParams.SetupSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const PostSetupResponseSchema = BasicChannelServerResponseSchema;

// POST REQUEST SETUP
const PostRequestSetupBodySchema = PostSetupBodySchema;

const PostRequestSetupResponseSchema = BasicChannelServerResponseSchema;

// POST DEPOSIT
const PostDepositBodySchema = Type.Intersect([
  EngineParams.DepositSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const PostDepositResponseSchema = BasicChannelServerResponseSchema;

// POST DEPOSIT
const PostRequestCollateralBodySchema = Type.Intersect([
  EngineParams.RequestCollateralSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const PostRequestCollateralResponseSchema = BasicChannelServerResponseSchema;

// POST SEND DEPOSIT TX
const PostSendDepositTxBodySchema = Type.Object({
  channelAddress: TAddress,
  amount: TIntegerString,
  assetId: TAddress,
  chainId: TChainId,
  publicIdentifier: TPublicIdentifier,
});

const PostSendDepositTxResponseSchema = {
  200: Type.Object({
    txHash: TBytes32,
  }),
};

// POST CREATE CONDITIONAL TRANSFER
const PostConditionalTransferBodySchema = Type.Intersect([
  EngineParams.ConditionalTransferSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const PostConditionalTransferResponseSchema = BasicTransferServerResponseSchema;

// POST RESOLVE CONDITIONAL TRANSFER
const PostResolveTransferBodySchema = Type.Intersect([
  EngineParams.ResolveTransferSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const PostResolveTransferResponseSchema = BasicTransferServerResponseSchema;

// POST WITHDRAW TRANSFER
const PostWithdrawTransferBodySchema = Type.Intersect([
  EngineParams.WithdrawSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const PostWithdrawTransferResponseSchema = {
  200: Type.Object({
    channelAddress: TAddress,
    transferId: TBytes32,
    transactionHash: Type.Optional(TBytes32),
  }),
};

// CREATE NODE
const PostCreateNodeBodySchema = Type.Object({
  index: Type.Integer({ minimum: 0, maximum: 2147483647 }),
  mnemonic: Type.Optional(Type.String()),
});

const PostCreateNodeResponseSchema = {
  200: Type.Object({
    publicIdentifier: TPublicIdentifier,
    signerAddress: TAddress,
    index: Type.Integer(),
  }),
};

// ADMIN
const PostAdminBodySchema = Type.Object({
  adminToken: Type.String({
    example: "cxt1234",
    description: "Admin token",
  }),
});

const PostAdminResponseSchema = {
  200: Type.Object({
    message: Type.String(),
  }),
};

//////////////////
/// Dispute Methods

// DISPUTE CHANNEL
const PostSendDisputeChannelTxBodySchema = Type.Intersect([
  EngineParams.DisputeChannelSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const PostSendDisputeChannelTxResponseSchema = {
  200: Type.Object({
    txHash: TBytes32,
  }),
};

// DEFUND CHANNEL
const PostSendDefundChannelTxBodySchema = Type.Intersect([
  EngineParams.DefundChannelSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const PostSendDefundChannelTxResponseSchema = {
  200: Type.Object({
    txHash: TBytes32,
  }),
};

// DISPUTE TRANSFER
const PostSendDisputeTransferTxBodySchema = Type.Intersect([
  EngineParams.DisputeTransferSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const PostSendDisputeTransferTxResponseSchema = {
  200: Type.Object({
    txHash: TBytes32,
  }),
};

// DEFUND TRANSFER
const PostSendDefundTransferTxBodySchema = Type.Intersect([
  EngineParams.DefundTransferSchema,
  Type.Object({ publicIdentifier: TPublicIdentifier }),
]);

const PostSendDefundTransferTxResponseSchema = {
  200: Type.Object({
    txHash: TBytes32,
  }),
};

// Namespace exports
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace NodeParams {
  export const GetTransferStateByRoutingIdSchema = GetTransferStateByRoutingIdParamsSchema;
  export type GetTransferStateByRoutingId = Static<typeof GetTransferStateByRoutingIdParamsSchema>;

  export const GetTransferStatesByRoutingIdSchema = GetTransferStatesByRoutingIdParamsSchema;
  export type GetTransferStatesByRoutingId = Static<typeof GetTransferStatesByRoutingIdParamsSchema>;

  export const GetTransferStateSchema = GetTransferStateParamsSchema;
  export type GetTransferState = Static<typeof GetTransferStateParamsSchema>;

  export const GetActiveTransfersByChannelAddressSchema = GetActiveTransfersByChannelAddressParamsSchema;
  export type GetActiveTransfersByChannelAddress = Static<typeof GetActiveTransfersByChannelAddressParamsSchema>;

  export const GetChannelStateSchema = GetChannelStateParamsSchema;
  export type GetChannelState = Static<typeof GetChannelStateSchema>;

  export const GetChannelStatesSchema = GetChannelStatesParamsSchema;
  export type GetChannelStates = Static<typeof GetChannelStatesSchema>;

  export const GetChannelStateByParticipantsSchema = GetChannelStateByParticipantsParamsSchema;
  export type GetChannelStateByParticipants = Static<typeof GetChannelStateByParticipantsSchema>;

  export const GetListenerSchema = GetListenerParamsSchema;
  export type GetListener = Static<typeof GetListenerSchema>;

  export const GetListenersSchema = GetListenersParamsSchema;
  export type GetListeners = Static<typeof GetListenersSchema>;

  export const GetConfigSchema = Type.Object({});
  export type GetConfig = Static<typeof GetConfigSchema>;

  export const SetupSchema = PostSetupBodySchema;
  export type Setup = Static<typeof SetupSchema>;

  export const RequestSetupSchema = PostRequestSetupBodySchema;
  export type RequestSetup = Static<typeof RequestSetupSchema>;

  export const DepositSchema = PostDepositBodySchema;
  export type Deposit = Static<typeof DepositSchema>;

  export const RequestCollateralSchema = PostRequestCollateralBodySchema;
  export type RequestCollateral = Static<typeof RequestCollateralSchema>;

  export const SendDepositTxSchema = PostSendDepositTxBodySchema;
  export type SendDepositTx = Static<typeof SendDepositTxSchema>;

  export const ConditionalTransferSchema = PostConditionalTransferBodySchema;
  export type ConditionalTransfer = Static<typeof ConditionalTransferSchema>;

  export const ResolveTransferSchema = PostResolveTransferBodySchema;
  export type ResolveTransfer = Static<typeof ResolveTransferSchema>;

  export const WithdrawSchema = PostWithdrawTransferBodySchema;
  export type Withdraw = Static<typeof WithdrawSchema>;

  export const RegisterListenerSchema = PostRegisterListenerBodySchema;
  export type RegisterListener = Static<typeof RegisterListenerSchema>;

  export const AdminSchema = PostAdminBodySchema;
  export type Admin = Static<typeof AdminSchema>;

  export const CreateNodeSchema = PostCreateNodeBodySchema;
  export type CreateNode = Static<typeof CreateNodeSchema>;

  export const SendDisputeChannelTxSchema = PostSendDisputeChannelTxBodySchema;
  export type SendDisputeChannelTx = Static<typeof SendDisputeChannelTxSchema>;

  export const SendDefundChannelTxSchema = PostSendDefundChannelTxBodySchema;
  export type SendDefundChannelTx = Static<typeof SendDefundChannelTxSchema>;

  export const SendDisputeTransferTxSchema = PostSendDisputeTransferTxBodySchema;
  export type SendDisputeTransferTx = Static<typeof SendDisputeTransferTxSchema>;

  export const SendDefundTransferTxSchema = PostSendDefundTransferTxBodySchema;
  export type SendDefundTransferTx = Static<typeof SendDefundTransferTxSchema>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace NodeResponses {
  export const GetTransferStateByRoutingIdSchema = GetTransferStateByRoutingIdResponseSchema;
  export type GetTransferStateByRoutingId = Static<typeof GetTransferStateByRoutingIdResponseSchema["200"]>;

  export const GetTransferStatesByRoutingIdSchema = GetTransferStatesByRoutingIdResponseSchema;
  export type GetTransferStatesByRoutingId = Static<typeof GetTransferStatesByRoutingIdResponseSchema["200"]>;

  export const GetTransferStateSchema = GetTransferStateResponseSchema;
  export type GetTransferState = Static<typeof GetTransferStateResponseSchema>;

  export const GetActiveTransfersByChannelAddressSchema = GetActiveTransfersByChannelAddressResponseSchema;
  export type GetActiveTransfersByChannelAddress = Static<
    typeof GetActiveTransfersByChannelAddressResponseSchema["200"]
  >;

  export const GetChannelStateSchema = GetChannelStateResponseSchema;
  export type GetChannelState = Static<typeof GetChannelStateSchema["200"]>;

  export const GetChannelStateByParticipantsSchema = GetChannelStateByParticipantsResponseSchema;
  export type GetChannelStateByParticipants = Static<typeof GetChannelStateByParticipantsSchema["200"]>;

  export const GetChannelStatesSchema = GetChannelStatesResponseSchema;
  export type GetChannelStates = Static<typeof GetChannelStatesSchema["200"]>;

  export const GetListenerSchema = GetListenerResponseSchema;
  export type GetListener = Static<typeof GetListenerSchema["200"]>;

  export const GetListenersSchema = GetListenersResponseSchema;
  export type GetListeners = Static<typeof GetListenersSchema["200"]>;

  export const GetConfigSchema = GetConfigResponseSchema;
  export type GetConfig = Static<typeof GetConfigSchema["200"]>;

  export const SetupSchema = PostSetupResponseSchema;
  export type Setup = Static<typeof SetupSchema["200"]>;

  export const RequestSetupSchema = PostRequestSetupResponseSchema;
  export type RequestSetup = Static<typeof RequestSetupSchema["200"]>;

  export const DepositSchema = PostDepositResponseSchema;
  export type Deposit = Static<typeof DepositSchema["200"]>;

  export const RequestCollateralSchema = PostRequestCollateralResponseSchema;
  export type RequestCollateral = Static<typeof RequestCollateralSchema["200"]>;

  export const SendDepositTxSchema = PostSendDepositTxResponseSchema;
  export type SendDepositTx = Static<typeof SendDepositTxSchema["200"]>;

  export const ConditionalTransferSchema = PostConditionalTransferResponseSchema;
  export type ConditionalTransfer = Static<typeof ConditionalTransferSchema["200"]>;

  export const ResolveTransferSchema = PostResolveTransferResponseSchema;
  export type ResolveTransfer = Static<typeof ResolveTransferSchema["200"]>;

  export const WithdrawSchema = PostWithdrawTransferResponseSchema;
  export type Withdraw = Static<typeof WithdrawSchema["200"]>;

  export const RegisterListenerSchema = PostRegisterListenerResponseSchema;
  export type RegisterListener = Static<typeof RegisterListenerSchema["200"]>;

  export const AdminSchema = PostAdminResponseSchema;
  export type Admin = Static<typeof AdminSchema["200"]>;

  export const CreateNodeSchema = PostCreateNodeResponseSchema;
  export type CreateNode = Static<typeof CreateNodeSchema["200"]>;

  export const SendDisputeChannelTxSchema = PostSendDisputeChannelTxResponseSchema;
  export type SendDisputeChannelTx = Static<typeof PostSendDisputeChannelTxResponseSchema["200"]>;

  export const SendDefundChannelTxSchema = PostSendDefundChannelTxResponseSchema;
  export type SendDefundChannelTx = Static<typeof PostSendDefundChannelTxResponseSchema["200"]>;

  export const SendDisputeTransferTxSchema = PostSendDisputeTransferTxResponseSchema;
  export type SendDisputeTransferTx = Static<typeof PostSendDisputeTransferTxResponseSchema["200"]>;

  export const SendDefundTransferTxSchema = PostSendDefundTransferTxResponseSchema;
  export type SendDefundTransferTx = Static<typeof PostSendDefundTransferTxResponseSchema["200"]>;
}
