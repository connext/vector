import { Static, Type } from "@sinclair/typebox";

// GET NONCE
export const getNonceParamsSchema = Type.Object({
  userIdentifier: Type.String({
    example: "indra8AXWmo3dFpK1drnjeWPyi9KTy9Fy3SkCydWx8waQrxhnW4KPmR",
    description: "Public identifier",
  }),
});

export type GetNonceRequestParams = Static<typeof getNonceParamsSchema>;

export const getNonceResponseSchema = {
  200: Type.Object({
    nonce: Type.String({ example: "abc" }),
  }),
};
export type GetNonceResponseBody = Static<typeof getNonceResponseSchema["200"]>;

// POST AUTH
export const postAuthBodySchema = Type.Object({
  userIdentifier: Type.String({
    example: "indra8AXWmo3dFpK1drnjeWPyi9KTy9Fy3SkCydWx8waQrxhnW4KPmR",
    description: "Public identifier",
  }),
  sig: Type.String({
    description: "Signature of nonce using public identifier private key",
  }),
  adminToken: Type.Optional(
    Type.String({
      example: "connext123",
      description: "Admin token to grant full permissions",
    }),
  ),
});

export type PostAuthRequestBody = Static<typeof postAuthBodySchema>;

export const postAuthResponseSchema = {
  200: Type.Object({
    token: Type.String({ example: "abc", description: "Token to be used for messaging auth" }),
  }),
};
export type PostAuthResponseBody = Static<typeof postAuthResponseSchema["200"]>;
