import { TContractAddresses, TUrl } from "@connext/vector-types";
import { Static, Type } from "@sinclair/typebox";
import Ajv from "ajv";

const ajv = new Ajv();

const VectorNodeConfigSchema = Type.Object({
  adminToken: Type.String(),
  authUrl: Type.String({ format: "uri" }),
  chainAddresses: Type.Map(TContractAddresses),
  chainProviders: Type.Map(TUrl),
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
  mnemonic: Type.Optional(Type.String()),
  natsUrl: TUrl,
  redisUrl: TUrl,
});

type VectorNodeConfig = Static<typeof VectorNodeConfigSchema>;
const mnemonic = process.env.VECTOR_MNEMONIC;
const dbUrl = process.env.VECTOR_DATABASE_URL;
let vectorConfig: VectorNodeConfig;
try {
  if (!process.env.VECTOR_CONFIG) {
    throw new Error(`"${process.env.VECTOR_CONFIG}"`);
  }
  vectorConfig = JSON.parse(process.env.VECTOR_CONFIG!);
} catch (e) {
  throw new Error(`VECTOR_CONFIG contains invalid JSON: ${e.message}`);
}

console.log(`vectorConfig`, vectorConfig);

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
