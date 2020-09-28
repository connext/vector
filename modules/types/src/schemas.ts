import { Static, TStringLiteral, Type } from "@sinclair/typebox";

import {
  LinkedTransferResolverEncoding,
  LinkedTransferStateEncoding,
  WithdrawResolverEncoding,
  WithdrawStateEncoding,
} from "./transferDefinitions";
import { ChannelRpcMethods } from "./vectorProvider";

// String pattern types
export const TAddress = Type.Pattern(/^0x[a-fA-F0-9]{40}$/);
export const TIntegerString = Type.Pattern(/^([0-9])*$/);
export const TPublicIdentifier = Type.Pattern(/^indra([a-zA-Z0-9]{50})$/);
export const TBytes32 = Type.Pattern(/^0x([a-fA-F0-9]{64})$/);
export const TSignature = Type.Pattern(/^0x([a-fA-F0-9]{130})$/);

// Convenience types
export const TChainId = Type.Number({ minimum: 1 });

// Object pattern types
export const TBalance = Type.Object({
  to: Type.Array(TAddress),
  amount: Type.Array(TIntegerString),
});

// Transfer pattern types
const LinkedTransferStateSchema = Type.Object({
  balance: TBalance,
  linkedHash: TBytes32,
});
const LinkedTransferResolverSchema = Type.Object({
  preImage: TBytes32,
});
const LinkedTransferEncodingSchema = Type.Array([
  Type.Literal(LinkedTransferStateEncoding),
  Type.Literal(LinkedTransferResolverEncoding),
]);

const WithdrawTransferStateSchema = Type.Object({
  balance: TBalance,
  aliceSignature: TSignature,
  signers: Type.Array(TAddress),
  data: TBytes32,
  nonce: TIntegerString,
  fee: TIntegerString,
});
const WithdrawTransferResolverSchema = Type.Object({
  bobSignature: TSignature,
});
const WithdrawTransferEncodingSchema = Type.Array([
  Type.Literal(WithdrawStateEncoding),
  Type.Literal(WithdrawResolverEncoding),
]);

export const TransferStateSchema = Type.Union([LinkedTransferStateSchema, WithdrawTransferStateSchema]);
export const TransferResolverSchema = Type.Union([LinkedTransferResolverSchema, WithdrawTransferResolverSchema]);
export const TransferEncodingSchema = Type.Union([LinkedTransferEncodingSchema, WithdrawTransferEncodingSchema]);

////////////////////////////////////////
// Protocol API Parameter schemas
const SetupProtocolParamsSchema = Type.Object({
  counterpartyIdentifier: TPublicIdentifier,
  timeout: TIntegerString,
  networkContext: Type.Object({
    channelFactoryAddress: TAddress,
    channelMastercopyAddress: TAddress,
    withdrawDefinition: TAddress,
    linkedTransferDefinition: Type.Optional(TAddress),
    chainId: TChainId,
    providerUrl: Type.String({ format: "uri" }),
  }),
});

const DepositProtocolParamsSchema = Type.Object({
  channelAddress: TAddress,
  assetId: TAddress,
});

const CreateProtocolParamsSchema = Type.Object({
  channelAddress: TAddress,
  amount: TIntegerString,
  assetId: TAddress,
  transferDefinition: TAddress,
  transferInitialState: TransferStateSchema,
  timeout: TIntegerString,
  encodings: TransferEncodingSchema,
  signers: Type.Array(TAddress),
  meta: Type.Optional(Type.Any()),
});

const ResolveProtocolParamsSchema = Type.Object({
  channelAddress: TAddress,
  transferId: TBytes32,
  transferResolver: TransferResolverSchema,
  meta: Type.Optional(Type.Any()),
});

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ProtocolParams {
  export const SetupSchema = SetupProtocolParamsSchema;
  export type Setup = Static<typeof SetupProtocolParamsSchema>;
  export const DepositSchema = DepositProtocolParamsSchema;
  export type Deposit = Static<typeof DepositProtocolParamsSchema>;
  export const CreateSchema = CreateProtocolParamsSchema;
  export type Create = Static<typeof CreateProtocolParamsSchema>;
  export const ResolveSchema = ResolveProtocolParamsSchema;
  export type Resolve = Static<typeof ResolveProtocolParamsSchema>;
}

////////////////////////////////////////
// Engine API Parameter schemas

const GetChannelStateByParticipantsParamsSchema = Type.Object({
  alice: TPublicIdentifier,
  bob: TPublicIdentifier,
  chainId: TChainId,
});

const SetupEngineParamsSchema = Type.Object({
  counterpartyIdentifier: TPublicIdentifier,
  chainId: TChainId,
  timeout: TIntegerString,
});

const DepositEngineParamsSchema = Type.Object({
  channelAddress: TAddress,
  assetId: TAddress,
});

const SharedConditionalTransferParamsSchema = Type.Object({
  channelAddress: TAddress,
  amount: TIntegerString,
  assetId: TAddress,
  recipient: Type.Optional(TPublicIdentifier),
  recipientChainId: Type.Optional(TChainId),
  recipientAssetId: Type.Optional(TAddress),
  timeout: Type.Optional(TIntegerString),
  routingId: Type.Optional(TBytes32), // This is needed for hopped transfers, but it might get confusing against transferId
  meta: Type.Any(),
});

const LinkedTransferDetailsSchema = Type.Object({
  conditionType: Type.Literal("LinkedTransfer"),
  details: Type.Object({
    linkedHash: TBytes32,
  }),
});

const LinkedTransferParamsSchema = Type.Intersect([SharedConditionalTransferParamsSchema, LinkedTransferDetailsSchema]);

// TODO: resolves to any, revisit when we have more conditional transfers
const ConditionalTransferParamsSchema = Type.Union([LinkedTransferParamsSchema]);

const SharedResolveTransferParamsSchema = Type.Object({
  channelAddress: TAddress,
  routingId: TBytes32, // This is needed for hopped transfers, but it might get confusing against transferId
  meta: Type.Any(), // TODO: better meta?
});

const ResolveLinkedTransferParamsSchema = Type.Intersect([
  SharedResolveTransferParamsSchema,
  Type.Object({
    conditionType: Type.Literal("LinkedTransfer"),
    details: Type.Object({
      preImage: TBytes32,
    }),
  }),
]);

// TODO: resolves to any, revisit when we have more conditional transfers
const ResolveTransferParamsSchema = Type.Union([ResolveLinkedTransferParamsSchema]);

const WithdrawParamsSchema = Type.Object({
  channelAddress: TAddress,
  amount: TIntegerString,
  assetId: TAddress,
  recipient: TAddress,
  fee: Type.Optional(TIntegerString),
});

const RpcRequestEngineParamsSchema = Type.Object({
  id: Type.Number({ minimum: 1 }),
  jsonrpc: Type.Literal("2.0"),
  method: Type.Union(
    Object.values(ChannelRpcMethods).map(methodName => Type.Literal(methodName)) as [TStringLiteral<string>],
  ),
  params: Type.Optional(Type.Any()),
});

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace EngineParams {
  export const RpcRequestSchema = RpcRequestEngineParamsSchema;
  export type RpcRequest = Static<typeof RpcRequestEngineParamsSchema>;

  export const GetChannelStateSchema = TAddress;
  export type GetChannelState = Static<typeof GetChannelStateSchema>;

  export const GetChannelStateByParticipantsSchema = GetChannelStateByParticipantsParamsSchema;
  export type GetChannelStateByParticipants = Static<typeof GetChannelStateByParticipantsSchema>;

  export const SetupSchema = SetupEngineParamsSchema;
  export type Setup = Static<typeof SetupEngineParamsSchema>;

  export const DepositSchema = DepositEngineParamsSchema;
  export type Deposit = Static<typeof DepositEngineParamsSchema>;

  export const ConditionalTransferSchema = LinkedTransferParamsSchema;
  export type ConditionalTransfer = Static<typeof ConditionalTransferSchema>;

  export const ResolveTransferSchema = ResolveLinkedTransferParamsSchema;
  export type ResolveTransfer = Static<typeof ResolveTransferSchema>;

  export const WithdrawSchema = WithdrawParamsSchema;
  export type Withdraw = Static<typeof WithdrawSchema>;
}

////////////////////////////////////////
// Server Node API Parameter schemas
// GET CHANNEL STATE
const getChannelStateParamsSchema = Type.Object({
  channelAddress: TAddress,
});

const getChannelStateResponseSchema = {
  200: Type.Any(),
};

// GET CHANNEL STATES
const getChannelStatesResponseSchema = {
  200: Type.Array(TAddress),
};

// GET CHANNEL STATE BY PARTICIPANTS
const getChannelStateByParticipantsParamsSchema = Type.Object({
  alice: TPublicIdentifier,
  bob: TPublicIdentifier,
  chainId: TChainId,
});

const getChannelStateByParticipantsResponseSchema = getChannelStateResponseSchema;

// GET CONFIG
const getConfigResponseSchema = {
  200: Type.Object({
    publicIdentifier: Type.String({
      example: "indra8AXWmo3dFpK1drnjeWPyi9KTy9Fy3SkCydWx8waQrxhnW4KPmR",
    }),
    signerAddress: TAddress,
  }),
};

// GET LISTENER
const getListenerParamsSchema = Type.Object({
  eventName: Type.String(),
});

const getListenerResponseSchema = {
  200: Type.Object({ url: Type.String({ format: "uri" }) }),
};

// GET LISTENERS
const getListenersResponseSchema = {
  200: Type.Map(Type.String({ format: "uri" })),
};

// POST SETUP
const postSetupBodySchema = Type.Object({
  counterpartyIdentifier: TPublicIdentifier,
  chainId: TChainId,
  timeout: TIntegerString,
});

const postSetupResponseSchema = {
  200: Type.Object({
    channelAddress: TAddress,
  }),
};

// POST DEPOSIT
const postDepositBodySchema = Type.Object({
  channelAddress: TAddress,
  assetId: TAddress,
});

const postDepositResponseSchema = {
  200: Type.Object({
    channelAddress: TAddress,
  }),
};

// POST SEND DEPOSIT TX
const postSendDepositTxBodySchema = Type.Object({
  channelAddress: TAddress,
  amount: TIntegerString,
  assetId: TAddress,
});

const postSendDepositTxResponseSchema = {
  200: Type.Object({
    txHash: TBytes32,
  }),
};

// POST LINKED TRANSFER
const postConditionalTransferBodySchema = LinkedTransferParamsSchema;

const postConditionalTransferResponseSchema = {
  200: Type.Object({
    channelAddress: TAddress,
    routingId: TBytes32,
  }),
};

const postResolveTransfer = ResolveLinkedTransferParamsSchema;

const postResolveTransferResponseSchema = {
  200: Type.Object({
    channelAddress: TAddress,
  }),
};

// REGISTER LISTENER
const postRegisterListenerBodySchema = Type.Map(Type.String({ format: "uri" }));

const postRegisterListenerResponseSchema = {
  200: Type.Object({
    message: Type.String(),
  }),
};

// ADMIN
const postAdminBodySchema = Type.Object({
  adminToken: Type.String({
    example: "cxt1234",
    description: "Admin token",
  }),
});

const postAdminResponseSchema = {
  200: Type.Object({
    message: Type.String(),
  }),
};

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ServerNodeParams {
  export const GetChannelStateSchema = getChannelStateParamsSchema;
  export type GetChannelState = Static<typeof GetChannelStateSchema>;

  export const GetChannelStateByParticipantsSchema = getChannelStateByParticipantsParamsSchema;
  export type GetChannelStateByParticipants = Static<typeof GetChannelStateByParticipantsSchema>;

  export const GetListenerSchema = getListenerParamsSchema;
  export type GetListener = Static<typeof GetListenerSchema>;

  export const SetupSchema = postSetupBodySchema;
  export type Setup = Static<typeof SetupSchema>;

  export const DepositSchema = postDepositBodySchema;
  export type Deposit = Static<typeof DepositSchema>;

  export const SendDepositTxSchema = postSendDepositTxBodySchema;
  export type SendDepositTx = Static<typeof SendDepositTxSchema>;

  export const ConditionalTransferSchema = postConditionalTransferBodySchema;
  export type ConditionalTransfer = Static<typeof ConditionalTransferSchema>;

  export const ResolveTransferSchema = postResolveTransfer;
  export type ResolveTransfer = Static<typeof ResolveTransferSchema>;

  export const RegisterListenerSchema = postRegisterListenerBodySchema;
  export type RegisterListener = Static<typeof RegisterListenerSchema>;

  export const AdminSchema = postAdminBodySchema;
  export type Admin = Static<typeof AdminSchema>;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ServerNodeResponses {
  export const GetChannelStateSchema = getChannelStateResponseSchema;
  export type GetChannelState = Static<typeof GetChannelStateSchema["200"]>;

  export const GetChannelStateByParticipantsSchema = getChannelStateByParticipantsResponseSchema;
  export type GetChannelStateByParticipants = Static<typeof GetChannelStateByParticipantsSchema["200"]>;

  export const GetChannelStatesSchema = getChannelStatesResponseSchema;
  export type GetChannelStates = Static<typeof GetChannelStatesSchema["200"]>;

  export const GetListenerSchema = getListenerResponseSchema;
  export type GetListener = Static<typeof GetListenerSchema["200"]>;

  export const GetListenersSchema = getListenersResponseSchema;
  export type GetListeners = Static<typeof GetListenersSchema["200"]>;

  export const GetConfigSchema = getConfigResponseSchema;
  export type GetConfig = Static<typeof GetConfigSchema["200"]>;

  export const SetupSchema = postSetupResponseSchema;
  export type Setup = Static<typeof SetupSchema["200"]>;

  export const DepositSchema = postDepositResponseSchema;
  export type Deposit = Static<typeof DepositSchema["200"]>;

  export const SendDepositTxSchema = postSendDepositTxResponseSchema;
  export type SendDepositTx = Static<typeof SendDepositTxSchema["200"]>;

  export const ConditionalTransferSchema = postConditionalTransferResponseSchema;
  export type ConditionalTransfer = Static<typeof ConditionalTransferSchema["200"]>;

  export const ResolveTransferSchema = postResolveTransferResponseSchema;
  export type ResolveTransfer = Static<typeof ResolveTransferSchema["200"]>;

  export const RegisterListenerSchema = postRegisterListenerResponseSchema;
  export type RegisterListener = Static<typeof RegisterListenerSchema["200"]>;

  export const AdminSchema = postAdminResponseSchema;
  export type Admin = Static<typeof AdminSchema["200"]>;
}
