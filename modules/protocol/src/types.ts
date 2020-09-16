import {
  LinkedTransferResolverEncoding,
  LinkedTransferStateEncoding,
  WithdrawResolverEncoding,
  WithdrawStateEncoding,
} from "@connext/vector-types";
import { Type } from "@sinclair/typebox";

////////////////////////////////////////
// Helper schemas
// String pattern types
const TAddress = Type.Pattern(/^0x[a-fA-F0-9]{40}$/);
const TBigNumber = Type.Pattern(/^([0-9])*$/);
const TPublicIdentifier = Type.Pattern(/^indra([a-zA-Z0-9]{50})$/);
const TBytes32 = Type.Pattern(/^0x([a-fA-F0-9]{64})$/);
const TSignature = Type.Pattern(/^0x([a-fA-F0-9]{130})$/);

// Object pattern types
const TBalance = Type.Object({
  to: Type.Array(TAddress),
  amount: Type.Array(TBigNumber),
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
  nonce: TBigNumber,
  fee: TBigNumber,
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
  counterpartyIdentifer: TPublicIdentifier,
  chainId: Type.Number({ minimum: 1 }),
  timeout: TBigNumber,
});

// TODO: should this be the def of the setup params
// export type SetupParams = Static<typeof SetupParamsSchema>;

export const DepositParamsSchema = Type.Object({
  channelAddress: TAddress,
  amount: TBigNumber,
  assetId: TAddress,
});

export const CreateParamsSchema = Type.Object({
  channelAddress: TAddress,
  amount: TBigNumber,
  assetId: TAddress,
  transferDefinition: TAddress,
  transferInitialState: TransferStateSchema,
  timeout: TBigNumber,
  encodings: TransferEncodingSchema,
  meta: Type.Optional(Type.Any()),
});

export const ResolveParamsSchema = Type.Object({
  channelAddress: TAddress,
  transferId: TBytes32,
  transferResolver: TransferResolverSchema,
  meta: Type.Optional(Type.Any()),
});
