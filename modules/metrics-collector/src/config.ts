import { TUrl, TChainId, TAddress, TIntegerString, AllowedSwapSchema } from "@connext/vector-types";
import { Static, Type } from "@sinclair/typebox";
import Ajv from "ajv";
import { getAddress } from "@ethersproject/address";
import { BigNumber } from "@ethersproject/bignumber";

const ajv = new Ajv();

const VectorMetricsConfigSchema = Type.Object({
  adminToken: Type.String(),
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
  messagingUrl: Type.Optional(TUrl)
});

type VectorMetricsConfig = Static<typeof VectorMetricsConfigSchema>;
let vectorConfig: VectorMetricsConfig;

try {
  vectorConfig = JSON.parse(process.env.VECTOR_CONFIG!);
} catch (e) {
  throw new Error(`VECTOR_CONFIG contains invalid JSON: ${e.message}`);
}

// Set defaults
vectorConfig.messagingUrl = vectorConfig.messagingUrl || "http://messaging";

const validate = ajv.compile(VectorMetricsConfigSchema);
const valid = validate(vectorConfig);

if (!valid) {
  console.error(`Invalid config: ${JSON.stringify(vectorConfig, null, 2)}`);
  throw new Error(validate.errors?.map((err) => err.message).join(","));
}

export const config = {
  ...vectorConfig
};
