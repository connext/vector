import pino from "pino";
import * as evm from "@connext/pure-evm-wasm";
import { Contract, CoreTransferState, TransferState, TransferResolver, Balance, ChannelCommitmentData, FullChannelState, IChannelSigner } from "@connext/vector-types";
import { TransferDefinition } from "@connext/vector-contracts";
import { Signer, utils } from "ethers";
import { hashChannelCommitment } from "@connext/vector-utils";

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
  if (!msg?.data.update) return false;
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
  if (!blob?.channelAddress) return false;
  if (!blob?.participants) return false;
  if (!blob?.timeout) return false;
  if (!blob?.balances) return false;
  if (!blob?.lockedValue) return false;
  if (!blob?.assetIds) return false;
  if (typeof blob?.nonce !== "number") return false;
  if (typeof blob?.latestDepositNonce !== "number") return false;
  if (!blob?.merkleRoot) return false;
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

// This function signs the state after the update is applied,
// not for the update that exists
export async function generateSignedChannelCommitment(
  newState: FullChannelState,
  signer: IChannelSigner,
  updateSignatures: string[],
): Promise<ChannelCommitmentData> {
  const { publicIdentifiers, networkContext, ...core } = newState;

  const unsigned = {
    chainId: networkContext.chainId,
    state: core,
    adjudicatorAddress: networkContext.adjudicatorAddress,
  };
  const filteredSigs = updateSignatures.filter(x => !!x);
  if (filteredSigs.length === 2) {
    // No need to sign, we have already signed
    return {
      ...unsigned,
      signatures: filteredSigs,
    };
  }

  // Only counterparty has signed
  const [counterpartySignature] = filteredSigs;
  const sig = await signer.signMessage(hashChannelCommitment({...unsigned, signatures: []}));
  const idx = publicIdentifiers.findIndex((p) => p === signer.publicIdentifier);
  return {
    ...unsigned,
    signatures: idx === 0 ? [sig, counterpartySignature] : [counterpartySignature, sig],
  };
}

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
