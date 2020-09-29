import { Type } from "@sinclair/typebox";

import {
  LinkedTransferResolverEncoding,
  LinkedTransferStateEncoding,
  WithdrawResolverEncoding,
  WithdrawStateEncoding,
} from "../transferDefinitions";

////////////////////////////////////////
//////// Shared object/string types

// String pattern types
export const TAddress = Type.Pattern(/^0x[a-fA-F0-9]{40}$/);
export const TIntegerString = Type.Pattern(/^([0-9])*$/);
export const TPublicIdentifier = Type.Pattern(/^indra([a-zA-Z0-9]{50})$/);
export const TBytes32 = Type.Pattern(/^0x([a-fA-F0-9]{64})$/);
export const TSignature = Type.Pattern(/^0x([a-fA-F0-9]{130})$/);
export const TUrl = Type.String({ format: "uri" });

// Convenience types
export const TChainId = Type.Number({ minimum: 1 });

// Object pattern types
export const TBalance = Type.Object({
  to: Type.Array(TAddress),
  amount: Type.Array(TIntegerString),
});

export const TBasicMeta = Type.Optional(Type.Any());

export const TRoutingMeta = Type.Object({
  routingId: TBytes32,
});

////////////////////////////////////////
//////// Transfer types

// Linked transfer pattern types
export const LinkedTransferStateSchema = Type.Object({
  balance: TBalance,
  linkedHash: TBytes32,
});
export const LinkedTransferResolverSchema = Type.Object({
  preImage: TBytes32,
});
export const LinkedTransferEncodingSchema = Type.Array([
  Type.Literal(LinkedTransferStateEncoding),
  Type.Literal(LinkedTransferResolverEncoding),
]);

// Withdraw transfer pattern types
export const WithdrawTransferStateSchema = Type.Object({
  balance: TBalance,
  initiatorSignature: TSignature,
  initiator: TAddress,
  responder: TAddress,
  data: TBytes32,
  nonce: TIntegerString,
  fee: TIntegerString,
});
export const WithdrawTransferResolverSchema = Type.Object({
  responderSignature: TSignature,
});
export const WithdrawTransferEncodingSchema = Type.Array([
  Type.Literal(WithdrawStateEncoding),
  Type.Literal(WithdrawResolverEncoding),
]);

// Shared transfer pattern types
export const TransferStateSchema = Type.Union([LinkedTransferStateSchema, WithdrawTransferStateSchema]);
export const TransferResolverSchema = Type.Union([LinkedTransferResolverSchema, WithdrawTransferResolverSchema]);
export const TransferEncodingSchema = Type.Union([LinkedTransferEncodingSchema, WithdrawTransferEncodingSchema]);
