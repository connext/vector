import {
  Balance,
  ChannelCommitmentData,
  FullChannelState,
  IChannelSigner,
  IVectorChainReader,
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
  aliceSignature?: string,
  bobSignature?: string,
): Promise<ChannelCommitmentData> {
  const { networkContext, ...core } = newState;

  const unsigned = {
    chainId: networkContext.chainId,
    state: core,
    channelFactoryAddress: networkContext.channelFactoryAddress,
  };
  if (aliceSignature && bobSignature) {
    // No need to sign, we have already signed
    return {
      ...unsigned,
      aliceSignature,
      bobSignature,
    };
  }

  // Only counterparty has signed
  const sig = await signer.signMessage(hashChannelCommitment(unsigned));
  const isAlice = signer.address === newState.alice;
  const signed = {
    ...unsigned,
    aliceSignature: isAlice ? sig : aliceSignature,
    bobSignature: isAlice ? bobSignature : sig,
  };
  return signed;
}

// TODO: make a result type?
export async function validateChannelUpdateSignatures(
  state: FullChannelState,
  aliceSignature?: string,
  bobSignature?: string,
  requiredSigners: "alice" | "bob" | "both" = "both",
): Promise<string | undefined> {
  // Generate the commitment
  const { networkContext, ...core } = state;
  const hash = hashChannelCommitment({
    chainId: networkContext.chainId,
    state: core,
    channelFactoryAddress: networkContext.channelFactoryAddress,
  });

  // Create a recovery helper to catch errors
  const tryRecovery = async (sig: string): Promise<string> => {
    let recovered: string;
    try {
      recovered = await recoverAddressFromChannelMessage(hash, sig);
    } catch (e) {
      recovered = e.message;
    }
    return recovered;
  };

  // Switch on the required signers to return the most descriptive
  // messages from utility function
  switch (requiredSigners) {
    case "both": {
      if (!aliceSignature || !bobSignature) {
        return `Missing alice or bobs signature, both required`;
      }
      const ralice = await tryRecovery(aliceSignature);
      const rbob = await tryRecovery(bobSignature);
      const msgs: string[] = [];
      if (ralice !== state.alice) {
        msgs.push(`Recovered ${ralice}, expected Alice: ${state.alice}`);
      }
      if (rbob !== state.bob) {
        msgs.push(`Recovered ${rbob}, expected Bob: ${state.bob}`);
      }
      return msgs.length === 0 ? undefined : msgs.toString();
    }
    case "alice": {
      if (!aliceSignature) {
        return `Missing alices signature`;
      }
      const recovered = await tryRecovery(aliceSignature);
      if (recovered !== state.alice) {
        return `Recovered ${recovered}, expected Alice: ${state.alice}`;
      }
      return undefined;
    }
    case "bob": {
      if (!bobSignature) {
        return `Missing bobs signature`;
      }
      const recovered = await tryRecovery(bobSignature);
      if (recovered !== state.bob) {
        return `Recovered ${recovered}, expected Bob: ${state.bob}`;
      }
      return undefined;
    }
    default: {
      return `Unrecognized requirement: ${requiredSigners}`;
    }
  }
}

export const reconcileDeposit = async (
  channelAddress: string,
  chainId: number,
  initialBalance: Balance,
  processedDepositA: string,
  processedDepositB: string,
  assetId: string,
  chainReader: IVectorChainReader,
): Promise<Result<{ balance: Balance; totalDepositedA: string; totalDepositedB: string }, Error>> => {
  // First get totalDepositedA and totalDepositedB
  const totalDepositedARes = await chainReader.getTotalDepositedA(channelAddress, chainId, assetId);
  if (totalDepositedARes.isError) {
    return Result.fail(totalDepositedARes.getError()!);
  }
  const totalDepositedA = totalDepositedARes.getValue();

  const totalDepositedBRes = await chainReader.getTotalDepositedB(channelAddress, chainId, assetId);
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
