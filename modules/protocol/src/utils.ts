import * as evm from "@connext/pure-evm-wasm";
import {
  Contract,
  Balance,
  ChannelCommitmentData,
  FullChannelState,
  IChannelSigner,
  CoreChannelState,
  VectorChannelMessage,
  VectorErrorMessage,
  FullTransferState,
} from "@connext/vector-types";
import { TestToken, TransferDefinition, VectorChannel } from "@connext/vector-contracts";
import { BigNumber, constants, Signer, utils } from "ethers";
import { hashChannelCommitment } from "@connext/vector-utils";
import { Evt } from "evt";
import pino from "pino";

const { defaultAbiCoder } = utils;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isChannelMessage(msg: any): msg is VectorChannelMessage {
  if (msg?.error) return false;
  if (!msg?.data?.update) return false;
  return true;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isErrorMessage(msg: any): msg is VectorErrorMessage {
  if (!msg?.error) return false;
  if (msg?.data) return false;
  return true;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isChannelState(blob: any): blob is CoreChannelState {
  if (!blob?.channelAddress) return false;
  if (!blob?.participants) return false;
  if (!blob?.timeout) return false;
  if (!blob?.balances) return false;
  if (!blob?.lockedBalance) return false;
  if (!blob?.assetIds) return false;
  if (typeof blob?.nonce !== "number") return false;
  if (typeof blob?.latestDepositNonce !== "number") return false;
  if (!blob?.merkleRoot) return false;
  return true;
}

// Adds a handler to an evt instance and returns the result
// based on the input arguments
export function addEvtHandler<T = any>(
  evt: Evt<T>,
  callback: (event: T) => void | Promise<void>,
  filter?: (event: T) => boolean,
  timeout?: number,
): Evt<T> | Promise<T> {
  // NOTE: If this type is not an array with a length, then using
  // the spread operator will cause errors on the evt package
  const attachArgs = [filter, timeout, callback].filter((x) => !!x) as [any, any, any];
  return evt.attach(...attachArgs);
}

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
  const filteredSigs = updateSignatures.filter((x) => !!x);
  if (filteredSigs.length === 2) {
    // No need to sign, we have already signed
    return {
      ...unsigned,
      signatures: filteredSigs,
    };
  }

  // Only counterparty has signed
  const [counterpartySignature] = filteredSigs;
  const sig = await signer.signMessage(hashChannelCommitment({ ...unsigned, signatures: [] }));
  const idx = publicIdentifiers.findIndex((p) => p === signer.publicIdentifier);
  return {
    ...unsigned,
    signatures: idx === 0 ? [sig, counterpartySignature] : [counterpartySignature, sig],
  };
}

export const create = async (
  transfer: FullTransferState,
  signer: Signer,
  bytecode?: string,
  logger: pino.BaseLogger = pino(),
): Promise<boolean> => {
  const encodedState = defaultAbiCoder.encode([transfer.transferEncodings[0]], [transfer.transferState]);
  const contract = new Contract(transfer.transferId, TransferDefinition.abi, signer);
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
  transfer: FullTransferState,
  signer: Signer,
  bytecode?: string,
  logger: pino.BaseLogger = pino(),
): Promise<Balance> => {
  const encodedState = defaultAbiCoder.encode([transfer.transferEncodings[0]], [transfer.transferState]);
  const encodedResolver = defaultAbiCoder.encode([transfer.transferEncodings[1]], [transfer.transferResolver]);
  const contract = new Contract(transfer.transferDefinition, TransferDefinition.abi, signer);
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

export const reconcileDeposit = async (
  channelAddress: string,
  initialBalance: Balance,
  latestDepositNonce: number,
  lockedBalance: string,
  assetId: string,
  signer: IChannelSigner,
): Promise<{ balance: Balance; latestDepositNonce: number }> => {
  const channelContract = new Contract(channelAddress, VectorChannel.abi, signer);
  let onchainBalance: BigNumber;
  try {
    onchainBalance = await channelContract.getBalance(assetId);
  } catch (e) {
    // Likely means channel contract was not deployed
    // TODO: check for reason?
    onchainBalance =
      assetId === constants.AddressZero
        ? await signer.provider!.getBalance(channelAddress)
        : await new Contract(assetId, TestToken.abi, signer).balanceOf(channelAddress);
  }

  let latestDepositA: { nonce: BigNumber; amount: BigNumber };
  try {
    latestDepositA = await channelContract.latestDepositByAssetId(assetId);
  } catch (e) {
    if (latestDepositNonce !== 0) {
      throw e;
    }
    // TODO: check for reason?
    // Channel contract was not deployed, use 0 value
    latestDepositA = { amount: BigNumber.from(0), nonce: BigNumber.from(0) };
  }

  const balanceA = latestDepositA.nonce.gt(latestDepositNonce)
    ? latestDepositA.amount.add(initialBalance.amount[0])
    : BigNumber.from(initialBalance.amount[0]);

  const balance = {
    ...initialBalance,
    amount: [balanceA.toString(), BigNumber.from(onchainBalance).sub(balanceA.add(lockedBalance)).toString()],
  };

  return {
    balance,
    latestDepositNonce: latestDepositA.nonce.toNumber(),
  };
};
