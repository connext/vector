import { HexString } from "@connext/types";
import { utils } from "ethers";

import * as ChannelFactory from "../artifacts/ChannelFactory.json";
import * as ChannelMastercopy from "../artifacts/ChannelMastercopy.json";
import * as ERC20 from "../artifacts/IERC20.json";
import * as HashlockTransfer from "../artifacts/HashlockTransfer.json";
import * as Proxy from "../artifacts/Proxy.json";
import * as TestToken from "../artifacts/TestToken.json";
import * as TransferDefinition from "../artifacts/ITransferDefinition.json";
import * as VectorChannel from "../artifacts/IVectorChannel.json";
import * as Withdraw from "../artifacts/Withdraw.json";

type Abi = Array<string | utils.FunctionFragment | utils.EventFragment | utils.ParamType>;

type Artifact = {
  contractName: string;
  abi: Abi;
  bytecode: HexString;
  deployedBytecode: HexString;
};

type Artifacts = { [contractName: string]: Artifact };

export const artifacts: Artifacts = {
  ChannelFactory,
  ChannelMastercopy,
  ERC20,
  HashlockTransfer,
  Proxy,
  TestToken,
  TransferDefinition,
  VectorChannel,
  Withdraw,
} as any;

export {
  ChannelFactory,
  ChannelMastercopy,
  ERC20,
  HashlockTransfer,
  Proxy,
  TestToken,
  TransferDefinition,
  VectorChannel,
  Withdraw,
};
