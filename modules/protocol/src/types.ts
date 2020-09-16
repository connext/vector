import {
  LinkedTransferResolverEncoding,
  LinkedTransferStateEncoding,
  WithdrawResolverEncoding,
  WithdrawStateEncoding,
} from "@connext/vector-types";
import { Static, Type } from "@sinclair/typebox";

////////////////////////////////////////
// Helper schemas
// String pattern types
const TAddress = Type.Pattern(/^0x[a-fA-F0-9]{40}$/);
const TIntegerString = Type.Pattern(/^([0-9])*$/);
const TPublicIdentifier = Type.Pattern(/^indra([a-zA-Z0-9]{50})$/);
const TBytes32 = Type.Pattern(/^0x([a-fA-F0-9]{64})$/);
const TSignature = Type.Pattern(/^0x([a-fA-F0-9]{130})$/);

// Object pattern types
const TBalance = Type.Object({
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
  initiatorSignature: TSignature,
  signers: Type.Array(TAddress),
  data: TBytes32,
  nonce: TIntegerString,
  fee: TIntegerString,
});
const WithdrawTransferResolverSchema = Type.Object({
  responderSignature: TSignature,
});
const WithdrawTransferEncodingSchema = Type.Array([
  Type.Literal(WithdrawStateEncoding),
  Type.Literal(WithdrawResolverEncoding),
]);

export const TransferStateSchema = Type.Union([LinkedTransferStateSchema, WithdrawTransferStateSchema]);
export const TransferResolverSchema = Type.Union([LinkedTransferResolverSchema, WithdrawTransferResolverSchema]);
export const TransferEncodingSchema = Type.Union([LinkedTransferEncodingSchema, WithdrawTransferEncodingSchema]);

////////////////////////////////////////
// Messaging schemas

// TODO: Define vector message schema

////////////////////////////////////////
// API Parameter schemas
export const SetupParamsSchema = Type.Object({
  counterpartyIdentifier: TPublicIdentifier,
  timeout: TIntegerString,
  networkContext: Type.Object({
    channelFactoryAddress: TAddress,
    vectorChannelMastercopyAddress: TAddress,
    adjudicatorAddress: TAddress,
    linkedTransferDefinition: Type.Optional(TAddress),
    withdrawDefinition: Type.Optional(TAddress),
    chainId: Type.Number({ minimum: 1 }),
    providerUrl: Type.String({ format: "uri" }),
  }),
});

export type SetupParams = Static<typeof SetupParamsSchema>;

export const DepositParamsSchema = Type.Object({
  channelAddress: TAddress,
  assetId: TAddress,
});

export const CreateParamsSchema = Type.Object({
  channelAddress: TAddress,
  amount: TIntegerString,
  assetId: TAddress,
  transferDefinition: TAddress,
  transferInitialState: TransferStateSchema,
  timeout: TIntegerString,
  encodings: TransferEncodingSchema,
  meta: Type.Optional(Type.Any()),
});

export const ResolveParamsSchema = Type.Object({
  channelAddress: TAddress,
  transferId: TBytes32,
  transferResolver: TransferResolverSchema,
  meta: Type.Optional(Type.Any()),
});
