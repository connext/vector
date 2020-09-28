import {
  Balance,
  ChannelCommitmentData,
  FullChannelState,
  IChannelSigner,
  IVectorOnchainService,
  Result,
} from "@connext/vector-types";
import { BigNumber } from "ethers";
import { hashChannelCommitment, recoverAddressFromChannelMessage } from "@connext/vector-utils";
import { Evt } from "evt";

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
  const attachArgs = [filter, timeout, callback].filter(x => !!x) as [any, any, any];
  return evt.attach(...attachArgs);
}

// This function signs the state after the update is applied,
// not for the update that exists
export async function generateSignedChannelCommitment(
  newState: FullChannelState,
  signer: IChannelSigner,
  updateSignatures: string[],
): Promise<ChannelCommitmentData> {
  const { networkContext, ...core } = newState;

  const unsigned: ChannelCommitmentData = {
    chainId: networkContext.chainId,
    state: core,
    channelFactoryAddress: networkContext.channelFactoryAddress,
    signatures: [],
  };
  const filteredSigs = updateSignatures.filter(x => !!x);
  if (filteredSigs.length === 2) {
    // No need to sign, we have already signed
    return {
      ...unsigned,
      signatures: updateSignatures,
    };
  }

  // Only counterparty has signed
  const [counterpartySignature] = filteredSigs;
  const sig = await signer.signMessage(hashChannelCommitment(unsigned));
  const idx = newState.participants.findIndex(p => p === signer.address);
  const signed = {
    ...unsigned,
    signatures: idx === 0 ? [sig, counterpartySignature] : [counterpartySignature, sig],
  };
  return signed;
}

// TODO: make a result type?
export async function validateChannelUpdateSignatures(
  state: FullChannelState,
  updateSignatures: string[],
  requiredSigners: 1 | 2 = 1,
): Promise<string | undefined> {
  const present = updateSignatures.filter(x => !!x).length;
  if (present < requiredSigners) {
    return `Only ${present}/${requiredSigners} signatures present`;
  }
  // generate the commitment
  const { networkContext, ...core } = state;
  const hash = hashChannelCommitment({
    chainId: networkContext.chainId,
    state: core,
    channelFactoryAddress: networkContext.channelFactoryAddress,
    signatures: [],
  });

  const results = (
    await Promise.all(
      updateSignatures.map(async (sigToVerify, idx) => {
        if (!sigToVerify) {
          return undefined;
        }
        const recovered = await recoverAddressFromChannelMessage(hash, sigToVerify);
        if (!state.participants.includes(recovered)) {
          return `Recovered ${recovered}, expected one of ${state.participants.toString()}`;
        }
        return recovered === state.participants[idx]
          ? undefined
          : `Recovered ${recovered}, expected ${state.participants[idx]}`;
      }),
    )
  ).filter(x => !!x);
  return results.length === 0 ? undefined : results.toString();
}

export const reconcileDeposit = async (
  channelAddress: string,
  chainId: number,
  initialBalance: Balance,
  processedDepositA: string,
  processedDepositB: string,
  assetId: string,
  onchainService: IVectorOnchainService,
): Promise<Result<{ balance: Balance; totalDepositedA: string; totalDepositedB: string }, Error>> => {
  // First get totalDepositedA and totalDepositedB
  const totalDepositedARes = await onchainService.getTotalDepositedA(channelAddress, chainId, assetId);
  if (totalDepositedARes.isError) {
    return Result.fail(totalDepositedARes.getError()!);
  }
  const totalDepositedA = totalDepositedARes.getValue();

  const totalDepositedBRes = await onchainService.getTotalDepositedB(channelAddress, chainId, assetId);
  if (totalDepositedBRes.isError) {
    return Result.fail(totalDepositedBRes.getError()!);
  }
  const totalDepositedB = totalDepositedBRes.getValue();

  // Now calculate the amount deposited that has not yet been reconciled
  const depositsToReconcile = [
    BigNumber.from(totalDepositedA).sub(processedDepositA),
    BigNumber.from(totalDepositedB).sub(processedDepositB),
  ];

  // Lastly, calculate the new balance

  const balance = {
    ...initialBalance,
    amount: [
      BigNumber.from(initialBalance.amount[0])
        .add(depositsToReconcile[0])
        .toString(),
      BigNumber.from(initialBalance.amount[1])
        .add(depositsToReconcile[1])
        .toString(),
    ],
  };

  return Result.ok({
    balance,
    totalDepositedA: totalDepositedA.toString(),
    totalDepositedB: totalDepositedB.toString(),
  });
};
