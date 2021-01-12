import { Static, Type } from "@sinclair/typebox";

import { TContractAddresses, TUrl } from "./basic";

export const VectorNodeConfigSchema = Type.Object({
  adminToken: Type.String(),
  authUrl: Type.Optional(Type.String({ format: "uri" })),
  chainAddresses: Type.Dict(TContractAddresses),
  chainProviders: Type.Dict(TUrl),
  dbUrl: Type.Optional(TUrl),
  logLevel: Type.Optional(
    Type.Union([
      Type.Literal("fatal"),
      Type.Literal("error"),
      Type.Literal("warn"),
      Type.Literal("info"),
      Type.Literal("debug"),
      Type.Literal("trace"),
      Type.Literal("silent"),
    ]),
  ),
  messagingUrl: Type.Optional(TUrl),
  mnemonic: Type.Optional(Type.String()),
  natsUrl: Type.Optional(TUrl),
  skipCheckIn: Type.Optional(Type.Boolean()),
});

export type VectorNodeConfig = Static<typeof VectorNodeConfigSchema>;
