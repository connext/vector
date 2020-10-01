import { TAddress } from "@connext/vector-types";
import { Static, Type } from "@sinclair/typebox";
import Ajv from "ajv";

const ajv = new Ajv();

const VectorNodeConfigSchema = Type.Object({
  adminToken: Type.String(),
  authUrl: Type.String({ format: "uri" }),
  chainAddresses: Type.Map(
    Type.Object({
      channelMastercopyAddress: TAddress,
      channelFactoryAddress: TAddress,
      linkedTransferDefinition: TAddress,
      withdrawDefinition: TAddress,
      TestToken: TAddress,
    }),
  ),
  chainProviders: Type.Map(Type.String({ format: "uri" })),
  dbUrl: Type.Optional(Type.String({ format: "uri" })),
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
  mnemonic: Type.Optional(Type.String()),
  natsUrl: Type.String({ format: "uri" }),
  port: Type.Integer(),
  redisUrl: Type.String({ format: "uri" }),
});

type VectorNodeConfig = Static<typeof VectorNodeConfigSchema>;
const mnemonic = process.env.VECTOR_MNEMONIC;
const dbUrl = process.env.VECTOR_DATABASE_URL;
let vectorConfig: VectorNodeConfig;
try {
  vectorConfig = JSON.parse(process.env.VECTOR_CONFIG!);
} catch (e) {
  throw new Error(`VECTOR_CONFIG contains invalid JSON: ${e.message}`);
}

const validate = ajv.compile(VectorNodeConfigSchema);
const valid = validate(vectorConfig);

if (!valid) {
  throw new Error(validate.errors?.map(err => err.message).join(","));
}

export const config = {
  mnemonic,
  dbUrl,
  ...vectorConfig,
} as VectorNodeConfig;
