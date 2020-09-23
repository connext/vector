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

  const unsigned = {
    chainId: networkContext.chainId,
    state: core,
    channelFactoryAddress: networkContext.channelFactoryAddress,
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
  const sig = await signer.signMessage(hashChannelCommitment({ ...unsigned, signatures: [] }));
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
  requiredSigs: 1 | 2 = 1,
): Promise<string | undefined> {
  const present = updateSignatures.filter(x => !!x).length;
  if (present < requiredSigs) {
    return `Only ${present}/${requiredSigs} signatures present`;
  }
  // generate the commitment
  const { networkContext, ...core } = state;
  const hash = hashChannelCommitment({
    chainId: networkContext.chainId,
    state: core,
    channelFactoryAddress: networkContext.channelFactoryAddress,
    signatures: [],
  });
  const valid = (
    await Promise.all(
      updateSignatures.map(async (sigToVerify, idx) => {
        if (!sigToVerify) {
          return undefined;
        }
        const recovered = await recoverAddressFromChannelMessage(hash, sigToVerify);
        return recovered === state.participants[idx] ? sigToVerify : undefined;
      }),
    )
  ).filter(x => !!x);
  if (valid.length < requiredSigs) {
    return `Only ${valid.length}/${requiredSigs} are valid signatures`;
  }
  return undefined;
}

export const reconcileDeposit = async (
  channelAddress: string,
  chainId: number,
  initialBalance: Balance,
  latestDepositNonce: number,
  lockedBalance: string,
  assetId: string,
  onchainService: IVectorOnchainService,
): Promise<Result<{ balance: Balance; latestDepositNonce: number }, Error>> => {
  const balanceRes = await onchainService.getChannelOnchainBalance(channelAddress, chainId, assetId);
  if (balanceRes.isError) {
    return Result.fail(balanceRes.getError()!);
  }
  const onchainBalance = balanceRes.getValue();

  const latestDepositARes = await onchainService.getLatestDepositByAssetId(
    channelAddress,
    chainId,
    assetId,
    latestDepositNonce,
  );
  if (latestDepositARes.isError) {
    return Result.fail(latestDepositARes.getError()!);
  }
  const latestDepositA = latestDepositARes.getValue();

  const balanceA = latestDepositA.nonce.gt(latestDepositNonce)
    ? latestDepositA.amount.add(initialBalance.amount[0])
    : BigNumber.from(initialBalance.amount[0]);

  const balance = {
    ...initialBalance,
    amount: [
      balanceA.toString(),
      BigNumber.from(onchainBalance)
        .sub(balanceA.add(lockedBalance))
        .toString(),
    ],
  };

  return Result.ok({
    balance,
    latestDepositNonce: latestDepositA.nonce.toNumber(),
  });
};
