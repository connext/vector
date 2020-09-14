import pino from "pino";
import * as evm from "@connext/pure-evm-wasm";
import { Contract, CoreTransferState, TransferState, TransferResolver, Balance } from "@connext/vector-types";
import { TransferDefinition } from "@connext/vector-contracts";
import { Signer, utils } from "ethers";

const { defaultAbiCoder } = utils;

// import { VectorChannelMessage, ChannelState } from "./types";

// NOTE: These are very simple type-specific utils
// To prevent cyclic dependencies, these should not be moved to the utils module
export const tidy = (str: string): string => `${str.replace(/\n/g, "").replace(/ +/g, " ")}`;

export const logger = pino();

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isChannelMessage(msg: any): boolean {
  if (msg?.error) return false;
  if (!msg?.data) return false;
  return true;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isErrorMessage(msg: any): boolean {
  if (msg?.data) return false;
  if (!msg?.error) return false;
  return true;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isChannelState(blob: any): boolean {
  if (!blob?.channelId) return false;
  if (!blob?.participants) return false;
  if (!blob?.chainId) return false;
  if (!blob?.latestNonce) return false;
  return true;
}

export const delay = (ms: number): Promise<void> => new Promise((res: any): any => setTimeout(res, ms));

export const delayAndThrow = (ms: number, msg = ""): Promise<undefined> =>
  new Promise((res: any, rej: any): any => setTimeout((): undefined => rej(new Error(msg)), ms));

// We might need to convert this file to JS...
// https://github.com/rustwasm/wasm-bindgen/issues/700#issuecomment-419708471
export const execEvmBytecode = (bytecode: string, payload: string): Uint8Array =>
  evm.exec(
    Uint8Array.from(Buffer.from(bytecode.replace(/^0x/, ""), "hex")),
    Uint8Array.from(Buffer.from(payload.replace(/^0x/, ""), "hex")),
  );

export const create = async (
  core: CoreTransferState,
  state: TransferState,
  signer: Signer,
  bytecode?: string,
): Promise<boolean> => {
  const encodedState = defaultAbiCoder.encode([core.transferEncodings[0]], [state]);
  const contract = new Contract(core.transferId, TransferDefinition.abi, signer);
  // TODO: use pure-evm
  if (bytecode) {
    try {
      const data = contract.interface.encodeFunctionData("create", [encodedState]);
      const output = await execEvmBytecode(bytecode, data);
      return contract.interface.decodeFunctionResult("create", output)[0];
    } catch (e) {
      logger.debug(`Failed to create with pure-evm`, { error: e.message });
    }
  }
  return contract.create(encodedState);
};

export const resolve = async (
  core: CoreTransferState,
  state: TransferState,
  resolver: TransferResolver,
  signer: Signer,
  bytecode?: string,
): Promise<Balance> => {
  const encodedState = defaultAbiCoder.encode([core.transferEncodings[0]], [state]);
  const encodedResolver = defaultAbiCoder.encode([core.transferEncodings[1]], [resolver]);
  const contract = new Contract(core.transferDefinition, TransferDefinition.abi, signer);
  if (bytecode) {
    try {
      const data = contract.interface.encodeFunctionData("resolve", [encodedState, encodedResolver]);
      const output = await execEvmBytecode(bytecode, data);
      const ret = contract.interface.decodeFunctionResult("resolve", output)[0];
      return {
        to: ret.to,
        amount: ret.amount,
      };
    } catch (e) {
      logger.debug(`Failed to create with pure-evm`, { error: e.message });
    }
  }
  const ret = await contract.resolve(encodedState, encodedResolver);
  // NOTE: contract values are returned as an array type, so transform the
  // returned value to the proper object
  return {
    to: ret.to,
    amount: ret.amount.map((a) => a.toString()),
  };
};
