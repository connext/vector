import { VectorNodeConfig, VectorNodeConfigSchema } from "@connext/vector-types";
import Ajv from "ajv";

const ajv = new Ajv();

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
