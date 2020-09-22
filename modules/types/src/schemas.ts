import { Static, Type } from "@sinclair/typebox";

import {
  LinkedTransferResolverEncoding,
  LinkedTransferStateEncoding,
  WithdrawResolverEncoding,
  WithdrawStateEncoding,
} from "./transferDefinitions";

// String pattern types
export const TAddress = Type.Pattern(/^0x[a-fA-F0-9]{40}$/);
export const TIntegerString = Type.Pattern(/^([0-9])*$/);
export const TPublicIdentifier = Type.Pattern(/^indra([a-zA-Z0-9]{50})$/);
export const TBytes32 = Type.Pattern(/^0x([a-fA-F0-9]{64})$/);
export const TSignature = Type.Pattern(/^0x([a-fA-F0-9]{130})$/);

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
// Protocol API Parameter schemas
const SetupParamsSchema = Type.Object({
  counterpartyIdentifier: TPublicIdentifier,
  timeout: TIntegerString,
  networkContext: Type.Object({
    channelFactoryAddress: TAddress,
    channelMastercopyAddress: TAddress,
    linkedTransferDefinition: Type.Optional(TAddress),
    withdrawDefinition: Type.Optional(TAddress),
    chainId: Type.Number({ minimum: 1 }),
    providerUrl: Type.String({ format: "uri" }),
  }),
});

const DepositParamsSchema = Type.Object({
  channelAddress: TAddress,
  assetId: TAddress,
});

const CreateParamsSchema = Type.Object({
  channelAddress: TAddress,
  amount: TIntegerString,
  assetId: TAddress,
  transferDefinition: TAddress,
  transferInitialState: TransferStateSchema,
  timeout: TIntegerString,
  encodings: TransferEncodingSchema,
  meta: Type.Optional(Type.Any()),
});

const ResolveParamsSchema = Type.Object({
  channelAddress: TAddress,
  transferId: TBytes32,
  transferResolver: TransferResolverSchema,
  meta: Type.Optional(Type.Any()),
});

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace ProtocolParams {
  export const SetupSchema = SetupParamsSchema;
  export type Setup = Static<typeof SetupParamsSchema>;
  export const DepositSchema = DepositParamsSchema;
  export type Deposit = Static<typeof DepositParamsSchema>;
  export const CreateSchema = CreateParamsSchema;
  export type Create = Static<typeof CreateParamsSchema>;
  export const ResolveSchema = ResolveParamsSchema;
  export type Resolve = Static<typeof ResolveParamsSchema>;
}

////////////////////////////////////////
// Server Node API Parameter schemas
// GET CHANNEL STATE
export const getChannelStateParamsSchema = Type.Object({
  channelAddress: TAddress,
});
export type GetChannelStateParams = Static<typeof getChannelStateParamsSchema>;

export const getChannelStateResponseSchema = {
  200: Type.Any(),
};
export type GetChannelStateResponseBody = Static<typeof getChannelStateResponseSchema["200"]>;

// GET CONFIG
export const getConfigResponseSchema = {
  200: Type.Object({
    publicIdentifier: Type.String({
      example: "indra8AXWmo3dFpK1drnjeWPyi9KTy9Fy3SkCydWx8waQrxhnW4KPmR",
    }),
    signerAddress: TAddress,
  }),
};
export type GetConfigResponseBody = Static<typeof getConfigResponseSchema["200"]>;

// POST SETUP
export const postSetupBodySchema = Type.Object({
  counterpartyIdentifier: Type.String({
    example: "indra8AXWmo3dFpK1drnjeWPyi9KTy9Fy3SkCydWx8waQrxhnW4KPmR",
    description: "Public identifier for counterparty",
  }),
  chainId: Type.Number({
    example: 1,
    description: "Chain ID",
  }),
  timeout: Type.String({
    example: "3600",
    description: "Dispute timeout",
  }),
});

export type PostSetupRequestBody = Static<typeof postSetupBodySchema>;

export const postSetupResponseSchema = {
  200: Type.Object({
    channelAddress: Type.String({ example: "0x", description: "Channel address" }),
  }),
};
export type PostSetupResponseBody = Static<typeof postSetupResponseSchema["200"]>;

// POST DEPOSIT
export const postDepositBodySchema = Type.Object({
  channelAddress: TAddress,
  amount: Type.String({
    example: "100000",
    description: "Amount in real units",
  }),
  assetId: TAddress,
});

export type PostDepositRequestBody = Static<typeof postDepositBodySchema>;

export const postDepositResponseSchema = {
  200: Type.Object({
    channelAddress: TAddress,
  }),
};
export type PostDepositResponseBody = Static<typeof postDepositResponseSchema["200"]>;

// POST LINKED TRANSFER
export const postLinkedTransferBodySchema = Type.Object({
  channelAddress: TAddress,
  amount: Type.String({
    example: "100000",
    description: "Amount in real units",
  }),
  assetId: TAddress,
  preImage: Type.String({
    example: "0x",
    description: "Bytes32 secret used to lock transfer",
  }),
  routingId: Type.String({
    example: "0x",
    description: "Bytes32 identifier used to route transfers properly",
  }),
  recipient: Type.Optional(
    Type.String({
      example: "indra8AXWmo3dFpK1drnjeWPyi9KTy9Fy3SkCydWx8waQrxhnW4KPmR",
      description: "Recipient's public identifier",
    }),
  ),
  recipientChainId: Type.Optional(
    Type.Number({
      example: 1,
      description: "Recipient chain ID, if on another chain",
    }),
  ),
  recipientAssetId: Type.Optional(TAddress),
  meta: Type.Optional(Type.Any()),
});

export type PostLinkedTransferRequestBody = Static<typeof postLinkedTransferBodySchema>;

export const postLinkedTransferResponseSchema = {
  200: Type.Object({
    channelAddress: TAddress,
  }),
};
export type PostLinkedTransferResponseBody = Static<typeof postLinkedTransferResponseSchema["200"]>;

// ADMIN
export const postAdminBodySchema = Type.Object({
  adminToken: Type.String({
    example: "cxt1234",
    description: "Admin token",
  }),
});
export type PostAdminRequestBody = Static<typeof postAdminBodySchema>;

export const postAdminResponseSchema = {
  200: Type.Object({
    message: Type.String(),
  }),
};
export type PostAdminResponseBody = Static<typeof postAdminResponseSchema["200"]>;
