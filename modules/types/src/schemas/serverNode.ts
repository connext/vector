import { Static, TStringLiteral, Type } from "@sinclair/typebox";

import { EngineEvent, EngineEvents } from "../engine";

import { EngineParams } from "./engine";
import { TUrl, TAddress, TPublicIdentifier, TIntegerString, TBytes32 } from "./basic";

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
  }),
};

// GET TRANSFER BY ROUTINGID
const GetTransferStateByRoutingIdParamsSchema = Type.Object({
  channelAddress: TAddress,
  routingId: TBytes32,
});

// TODO: Could be improved by creating a transfer state schema
const GetTransferStateByRoutingIdResponseSchema = {
  200: Type.Union([Type.Undefined, Type.Any()]),
};

// GET CHANNEL STATE
const GetChannelStateParamsSchema = EngineParams.GetChannelStateSchema;

// TODO: Could be improved by creating a channel state schema
const GetChannelStateResponseSchema = {
  200: Type.Union([Type.Undefined, Type.Any()]),
};

// GET CHANNEL STATES
const GetChannelStatesParamsSchema = EngineParams.GetChannelStatesSchema;

const GetChannelStatesResponseSchema = {
  200: Type.Array(TAddress),
};

// GET CHANNEL STATE BY PARTICIPANTS
const GetChannelStateByParticipantsParamsSchema = EngineParams.GetChannelStateByParticipantsSchema;

const GetChannelStateByParticipantsResponseSchema = GetChannelStateResponseSchema;

// GET CONFIG
const GetConfigResponseSchema = {
  200: Type.Object({
    publicIdentifier: TPublicIdentifier,
    signerAddress: TAddress,
  }),
};

// GET LISTENER
const GetListenerParamsSchema = Type.Object({
  eventName: Type.Union(Object.values(EngineEvents).map(e => Type.Literal(e)) as [TStringLiteral<EngineEvent>]),
});

const GetListenerResponseSchema = {
  200: Type.Object({ url: TUrl }),
};

// GET LISTENERS
const GetListenersResponseSchema = {
  200: Type.Map(TUrl),
};

// REGISTER LISTENER
const PostRegisterListenerBodySchema = Type.Map(TUrl);

const PostRegisterListenerResponseSchema = {
  200: Type.Object({
    message: Type.String(),
  }),
};

// POST SETUP
const PostSetupBodySchema = EngineParams.SetupSchema;

const PostSetupResponseSchema = BasicChannelServerResponseSchema;

// POST DEPOSIT
const PostDepositBodySchema = EngineParams.DepositSchema;

const PostDepositResponseSchema = BasicChannelServerResponseSchema;

// POST SEND DEPOSIT TX
const PostSendDepositTxBodySchema = Type.Object({
  channelAddress: TAddress,
  amount: TIntegerString,
  assetId: TAddress,
});

const PostSendDepositTxResponseSchema = {
  200: Type.Object({
    txHash: TBytes32,
  }),
};

// POST CREATE CONDITIONAL TRANSFER
const PostConditionalTransferBodySchema = EngineParams.ConditionalTransferSchema;

const PostConditionalTransferResponseSchema = BasicTransferServerResponseSchema;

// POST RESOLVE CONDITIONAL TRANSFER
const PostResolveTransfer = EngineParams.ResolveTransferSchema;

const PostResolveTransferResponseSchema = BasicTransferServerResponseSchema;

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

// Namespace exports
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ServerNodeParams {
  export const GetTransferStateByRoutingIdSchema = GetTransferStateByRoutingIdParamsSchema;
  export type GetTransferStateByRoutingId = Static<typeof GetTransferStateByRoutingIdParamsSchema>;

  export const GetChannelStateSchema = GetChannelStateParamsSchema;
  export type GetChannelState = Static<typeof GetChannelStateSchema>;

  export const GetChannelStatesSchema = GetChannelStatesParamsSchema;
  export type GetChannelStates = Static<typeof GetChannelStatesSchema>;

  export const GetChannelStateByParticipantsSchema = GetChannelStateByParticipantsParamsSchema;
  export type GetChannelStateByParticipants = Static<typeof GetChannelStateByParticipantsSchema>;

  export const GetListenerSchema = GetListenerParamsSchema;
  export type GetListener = Static<typeof GetListenerSchema>;

  export const SetupSchema = PostSetupBodySchema;
  export type Setup = Static<typeof SetupSchema>;

  export const DepositSchema = PostDepositBodySchema;
  export type Deposit = Static<typeof DepositSchema>;

  export const SendDepositTxSchema = PostSendDepositTxBodySchema;
  export type SendDepositTx = Static<typeof SendDepositTxSchema>;

  export const ConditionalTransferSchema = PostConditionalTransferBodySchema;
  export type ConditionalTransfer = Static<typeof ConditionalTransferSchema>;

  export const ResolveTransferSchema = PostResolveTransfer;
  export type ResolveTransfer = Static<typeof ResolveTransferSchema>;

  export const RegisterListenerSchema = PostRegisterListenerBodySchema;
  export type RegisterListener = Static<typeof RegisterListenerSchema>;

  export const AdminSchema = PostAdminBodySchema;
  export type Admin = Static<typeof AdminSchema>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ServerNodeResponses {
  export const GetTransferStateByRoutingIdSchema = GetTransferStateByRoutingIdResponseSchema;
  export type GetTransferStateByRoutingId = Static<typeof GetTransferStateByRoutingIdResponseSchema["200"]>;

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

  export const DepositSchema = PostDepositResponseSchema;
  export type Deposit = Static<typeof DepositSchema["200"]>;

  export const SendDepositTxSchema = PostSendDepositTxResponseSchema;
  export type SendDepositTx = Static<typeof SendDepositTxSchema["200"]>;

  export const ConditionalTransferSchema = PostConditionalTransferResponseSchema;
  export type ConditionalTransfer = Static<typeof ConditionalTransferSchema["200"]>;

  export const ResolveTransferSchema = PostResolveTransferResponseSchema;
  export type ResolveTransfer = Static<typeof ResolveTransferSchema["200"]>;

  export const RegisterListenerSchema = PostRegisterListenerResponseSchema;
  export type RegisterListener = Static<typeof RegisterListenerSchema["200"]>;

  export const AdminSchema = PostAdminResponseSchema;
  export type Admin = Static<typeof AdminSchema["200"]>;
}
