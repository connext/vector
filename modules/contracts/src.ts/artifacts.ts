import { HexString } from "@connext/vector-types";
import { utils } from "ethers";

import * as AssetTransfer from "../artifacts/AssetTransfer.json";
import * as ChannelFactory from "../artifacts/ChannelFactory.json";
import * as ChannelMastercopy from "../artifacts/ChannelMastercopy.json";
import * as FailingToken from "../artifacts/FailingToken.json";
import * as HashlockTransfer from "../artifacts/HashlockTransfer.json";
import * as Proxy from "../artifacts/Proxy.json";
import * as TestToken from "../artifacts/TestToken.json";
import * as TransferDefinition from "../artifacts/ITransferDefinition.json";
import * as TransferRegistry from "../artifacts/TransferRegistry.json";
import * as VectorChannel from "../artifacts/IVectorChannel.json";
import * as Withdraw from "../artifacts/Withdraw.json";
import * as TestChannel from "../artifacts/TestChannel.json";

type Abi = Array<string | utils.FunctionFragment | utils.EventFragment | utils.ParamType>;

type Artifact = {
  contractName: string;
  abi: Abi;
  bytecode: HexString;
  deployedBytecode: HexString;
};

type Artifacts = { [contractName: string]: Artifact };

export const artifacts: Artifacts = {
  AssetTransfer,
  ChannelFactory,
  ChannelMastercopy,
  FailingToken,
  HashlockTransfer,
  Proxy,
  TestChannel,
  TestToken,
  TransferDefinition,
  TransferRegistry,
  VectorChannel,
  Withdraw,
} as any;

export {
  AssetTransfer,
  ChannelFactory,
  ChannelMastercopy,
  FailingToken,
  HashlockTransfer,
  Proxy,
  TestChannel,
  TestToken,
  TransferDefinition,
  TransferRegistry,
  VectorChannel,
  Withdraw,
};
