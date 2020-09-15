import { Static, Type } from "@sinclair/typebox";

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
  channelAddress: Type.String({ example: "0x", description: "Channel address" }),
  amount: Type.String({
    example: "100000",
    description: "Amount in real units",
  }),
  assetId: Type.String({
    example: "0x",
    description: "ERC20-compatible token address, AddressZero for native currency (i.e. ETH)",
  }),
});

export type PostDepositRequestBody = Static<typeof postDepositBodySchema>;

export const postDepositResponseSchema = {
  200: Type.Object({
    channelAddress: Type.String({ example: "0x", description: "Channel address" }),
  }),
};
export type PostDepositResponseBody = Static<typeof postDepositResponseSchema["200"]>;

// POST LINKED TRANSFER
export const postLinkedTransferBodySchema = Type.Object({
  channelAddress: Type.String({ example: "0x", description: "Channel address" }),
  amount: Type.String({
    example: "100000",
    description: "Amount in real units",
  }),
  assetId: Type.String({
    example: "0x",
    description: "ERC20-compatible token address, AddressZero for native currency (i.e. ETH)",
  }),
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
  recipientAssetId: Type.Optional(
    Type.Number({
      example: "0x",
      description: "ERC20-compatible token address, AddressZero for native currency (i.e. ETH)",
    }),
  ),
  meta: Type.Optional(Type.Object({})),
});

export type PostLinkedTransferRequestBody = Static<typeof postLinkedTransferBodySchema>;

export const postLinkedTransferResponseSchema = {
  200: Type.Object({
    channelAddress: Type.String({ example: "0x", description: "Channel address" }),
  }),
};
export type PostLinkedTransferResponseBody = Static<typeof postLinkedTransferResponseSchema["200"]>;
