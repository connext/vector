import { deployments } from "@connext/vector-contracts";
import { VectorNodeConfig, VectorNodeConfigSchema } from "@connext/vector-types";
import Ajv from "ajv";

const ajv = new Ajv({ strict: false });

const mnemonicEnv = process.env.VECTOR_MNEMONIC;
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

// Set defaults
vectorConfig.messagingUrl = vectorConfig.messagingUrl || "http://messaging";
vectorConfig.baseGasSubsidyPercentage = vectorConfig.baseGasSubsidyPercentage ?? 100;

// Pull live network addresses out of public deployments if not provided explicitly
for (const chainId of Object.keys(vectorConfig.chainProviders)) {
  if (!vectorConfig.chainAddresses) {
    vectorConfig.chainAddresses = {} as any;
  }
  if (!vectorConfig.chainAddresses[chainId]) {
    vectorConfig.chainAddresses[chainId] = {} as any;
  }
  if (
    !vectorConfig.chainAddresses[chainId].channelFactoryAddress &&
    deployments[chainId] &&
    deployments[chainId].ChannelFactory
  ) {
    vectorConfig.chainAddresses[chainId].channelFactoryAddress = deployments[chainId].ChannelFactory.address;
  }
  if (
    !vectorConfig.chainAddresses[chainId].transferRegistryAddress &&
    deployments[chainId] &&
    deployments[chainId].TransferRegistry
  ) {
    vectorConfig.chainAddresses[chainId].transferRegistryAddress = deployments[chainId].TransferRegistry.address;
  }
}

const validate = ajv.compile(VectorNodeConfigSchema);
const valid = validate(vectorConfig);

if (!valid) {
  throw new Error(validate.errors?.map((err) => err.message).join(","));
}

const mnemonic = mnemonicEnv || vectorConfig.mnemonic;

export const config = {
  dbUrl,
  ...vectorConfig,
  mnemonic,
} as Omit<VectorNodeConfig, "mnemonic"> & { mnemonic: string };
