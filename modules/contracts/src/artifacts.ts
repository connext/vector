import { HexString } from "@connext/types";
import { utils } from "ethers";

import * as Adjudicator from "../artifacts/Adjudicator.json";
import * as Multisig from "../artifacts/Multisig.json";
import * as ChannelFactory from "../artifacts/ChannelFactory.json";

type Abi = Array<string | utils.FunctionFragment | utils.EventFragment | utils.ParamType>;

type Artifact = {
  contractName: string;
  abi: Abi;
  bytecode: HexString;
  deployedBytecode: HexString;
};

type Artifacts = { [contractName: string]: Artifact };

// Alias for easy access
// const Token = ConnextToken;

export const artifacts: Artifacts = {
  Adjudicator,
  Multisig,
  ChannelFactory,
} as any;

export {
  Adjudicator,
  Multisig,
  ChannelFactory,
};
