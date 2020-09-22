import { TAddress } from "@connext/vector-types";
import { Static, Type } from "@sinclair/typebox";

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
