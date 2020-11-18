import { VectorNodeConfig } from "@connext/vector-types";

const configEnv = process.env.REACT_APP_VECTOR_CONFIG;

export const config: VectorNodeConfig = JSON.parse(configEnv!);
