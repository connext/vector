import { deployments } from "@connext/vector-contracts";
import { TContractAddresses, TUrl, VectorNodeConfig, VectorNodeConfigSchema } from "@connext/vector-types";
import { Type } from "@sinclair/typebox";
import Ajv from "ajv";
import convict from "convict";

const ajv = new Ajv();

console.log("process.cwd(): ", process.cwd());

let vectorConfig: VectorNodeConfig;
try {
  vectorConfig = JSON.parse(process.env.VECTOR_CONFIG ?? "{}");
} catch (e) {
  throw new Error(`VECTOR_CONFIG contains invalid JSON: ${e.message}`);
}

convict.addParser([{ extension: "json", parse: JSON.parse }]);
const configConvict = convict({
  mnemonic: {
    default: null,
    env: "VECTOR_MNEMONIC",
  },
  dbUrl: {
    default: null,
    env: "VECTOR_DATABASE_URL",
  },
  messagingUrl: {
    default: "",
    env: "VECTOR_MESSAGING_URL",
  },
  authUrl: {
    default: "",
    env: "VECTOR_AUTH_URL",
  },
  natsUrl: {
    default: "",
    env: "VECTOR_NATS_URL",
  },
  skipCheckIn: {
    default: false,
    env: "VECTOR_SKIP_CHECK_IN",
  },
  adminToken: {
    default: null,
    env: "VECTOR_ADMIN_TOKEN",
  },
  baseGasSubsidyPercentage: {
    default: 100,
    env: "VECTOR_BASE_GAS_SUBSIDY_PERCENTAGE",
  },
  chainProviders: {
    default: null,
    env: "VECTOR_CHAIN_PROVIDERS",
    format: function check(val: string) {
      const cp = JSON.parse(val);
      const validate = ajv.compile(Type.Dict(TUrl));
      const valid = validate(cp);
      if (!valid) {
        throw new Error(validate.errors?.map((err) => err.message).join(","));
      }
    },
  },
  chainAddresses: {
    default: "{}",
    env: "VECTOR_CHAIN_ADDRESSES",
    format: function check(val: string) {
      const cp = JSON.parse(val);
      const validate = ajv.compile(Type.Dict(TContractAddresses));
      const valid = validate(cp);
      if (!valid) {
        throw new Error(validate.errors?.map((err) => err.message).join(","));
      }
    },
  },
  logLevel: {
    default: "info",
    env: "VECTOR_LOG_LEVEL",
  },
});
configConvict.loadFile("config.json");
configConvict.load(vectorConfig);

configConvict.validate({ allowed: "strict" });
vectorConfig = configConvict.getProperties() as any;
if (vectorConfig.authUrl === "" && vectorConfig.messagingUrl === "" && vectorConfig.natsUrl === "") {
  vectorConfig.messagingUrl = "http://messaging";
}
console.log("vectorConfig: ", vectorConfig);
vectorConfig.chainAddresses = JSON.parse(configConvict.get("chainAddresses"));

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
console.log("vectorConfig: ", vectorConfig);

// const validate = ajv.compile(VectorNodeConfigSchema);
// const valid = validate(vectorConfig);

// if (!valid) {
//   throw new Error(validate.errors?.map((err) => err.message).join(","));
// }

export const config = vectorConfig as Omit<VectorNodeConfig, "mnemonic"> & { mnemonic: string };
