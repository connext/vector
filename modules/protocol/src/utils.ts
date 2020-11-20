import {
  Balance,
  ChannelUpdate,
  CoreChannelState,
  CreateTransferParams,
  CreateUpdateDetails,
  DepositParams,
  FullChannelState,
  IChannelSigner,
  IVectorChainReader,
  ResolveTransferParams,
  ResolveUpdateDetails,
  Result,
  SetupParams,
  SetupUpdateDetails,
  UpdateParams,
  UpdateParamsMap,
  UpdateType,
} from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import { hashChannelCommitment, recoverAddressFromChannelMessage } from "@connext/vector-utils";

// Channels store `ChannelUpdate<T>` types as the `latestUpdate` field, which
// must be converted to the `UpdateParams<T> when syncing
export function getParamsFromUpdate<T extends UpdateType = any>(
  update: ChannelUpdate<T>,
  signer: IChannelSigner,
): UpdateParams<T> {
  const { channelAddress, type, details, fromIdentifier, toIdentifier, assetId } = update;
  let paramDetails: SetupParams | DepositParams | CreateTransferParams | ResolveTransferParams;
  switch (type) {
    case "setup": {
      const { networkContext, timeout } = details as SetupUpdateDetails;
      const params: SetupParams = {
        networkContext: { ...networkContext },
        timeout,
        counterpartyIdentifier: signer.publicIdentifier === fromIdentifier ? toIdentifier : fromIdentifier,
      };
      paramDetails = params;
      break;
    }
    case "deposit": {
      const params: DepositParams = {
        channelAddress,
        assetId,
      };
      paramDetails = params;
      break;
    }
    case "create": {
      // The balance in the update for create is the *channel* balance after
      // the update has been applied. The balance in the params is the
      // *initial balance* of the transfer
      const {
        balance,
        transferInitialState,
        transferDefinition,
        transferTimeout,
        meta,
      } = details as CreateUpdateDetails;
      const params: CreateTransferParams = {
        balance,
        channelAddress,
        assetId,
        transferDefinition,
        transferInitialState,
        timeout: transferTimeout,
        meta,
      };
      paramDetails = params;
      break;
    }
    case "resolve": {
      const { transferResolver, transferId, meta } = details as ResolveUpdateDetails;
      const params: ResolveTransferParams = {
        channelAddress,
        transferId,
        transferResolver,
        meta,
      };
      paramDetails = params;
      break;
    }
    default: {
      throw new Error(`Invalid update type ${type}`);
    }
  }
  return {
    channelAddress,
    type,
    details: paramDetails as UpdateParamsMap[T],
  };
}

// This function signs the state after the update is applied,
// not for the update that exists
export async function generateSignedChannelCommitment(
  newState: FullChannelState,
  signer: IChannelSigner,
  aliceSignature?: string,
  bobSignature?: string,
): Promise<Result<{ core: CoreChannelState; aliceSignature?: string; bobSignature?: string }, Error>> {
  const { networkContext, ...core } = newState;

  if (aliceSignature && bobSignature) {
    // No need to sign, we have already signed
    return Result.ok({
      core,
      aliceSignature,
      bobSignature,
    });
  }

  // Only counterparty has signed
  try {
    const sig = await signer.signMessage(hashChannelCommitment(core));
    const isAlice = signer.address === newState.alice;
    return Result.ok({
      core,
      aliceSignature: isAlice ? sig : aliceSignature,
      bobSignature: isAlice ? bobSignature : sig,
    });
  } catch (e) {
    return Result.fail(e);
  }
}

export async function validateChannelUpdateSignatures(
  state: FullChannelState,
  aliceSignature?: string,
  bobSignature?: string,
  requiredSigners: "alice" | "bob" | "both" = "both",
): Promise<Result<void | Error>> {
  // Generate the commitment
  const { networkContext, ...core } = state;
  let hash;
  try {
    hash = hashChannelCommitment(core);
  } catch (e) {
    return Result.fail(new Error("Failed to generate channel commitment hash"));
  }

  // Create a recovery helper to catch errors
  const tryRecovery = async (sig?: string): Promise<string> => {
    if (!sig) {
      return "No signature provided";
    }
    let recovered: string;
    try {
      recovered = await recoverAddressFromChannelMessage(hash, sig);
    } catch (e) {
      recovered = e.message;
    }
    return recovered;
  };

  const [rAlice, rBob] = await Promise.all([tryRecovery(aliceSignature), tryRecovery(bobSignature)]);

  const aliceSigned = rAlice === state.alice;
  const bobSigned = rBob === state.bob;

  const bobNeeded = requiredSigners === "bob" || requiredSigners === "both";
  const aliceNeeded = requiredSigners === "alice" || requiredSigners === "both";

  // Check if signers are required and valid
  if (aliceNeeded && bobNeeded && aliceSigned && bobSigned) {
    return Result.ok(undefined);
  }

  // Only one signer is required, but if there are two signatures both
  // should be valid
  if (aliceNeeded && aliceSigned && !bobSignature && !bobNeeded) {
    return Result.ok(undefined);
  }

  if (bobNeeded && bobSigned && !aliceSignature && !aliceNeeded) {
    return Result.ok(undefined);
  }

  // Only one is required, but both are provided (and should be valid)
  if (aliceSignature && aliceSigned && bobSignature && bobSigned) {
    return Result.ok(undefined);
  }

  // Construct an explicit error message
  const prefix = `Expected ${requiredSigners === "both" ? "alice + bob" : requiredSigners} ${
    aliceNeeded ? state.alice : ""
  }${bobNeeded ? " + " + state.bob : ""}. Got: `;

  const details = `${aliceNeeded ? "(alice) " + rAlice : ""}${bobNeeded ? "+ (bob) " + rBob : ""}`;

  return Result.fail(new Error(prefix + details));
}

export const reconcileDeposit = async (
  channelAddress: string,
  chainId: number,
  initialBalance: Balance,
  processedDepositA: string,
  processedDepositB: string,
  assetId: string,
  chainReader: IVectorChainReader,
): Promise<Result<{ balance: Balance; totalDepositsAlice: string; totalDepositsBob: string }, Error>> => {
  // First get totalDepositsAlice and totalDepositsBob
  const totalDepositedARes = await chainReader.getTotalDepositedA(channelAddress, chainId, assetId);
  if (totalDepositedARes.isError) {
    return Result.fail(totalDepositedARes.getError()!);
  }
  const totalDepositsAlice = totalDepositedARes.getValue();

  const totalDepositedBRes = await chainReader.getTotalDepositedB(channelAddress, chainId, assetId);
  if (totalDepositedBRes.isError) {
    return Result.fail(totalDepositedBRes.getError()!);
  }
  const totalDepositsBob = totalDepositedBRes.getValue();

  // Now calculate the amount deposited that has not yet been reconciled
  const depositsToReconcile = [
    BigNumber.from(totalDepositsAlice).sub(processedDepositA),
    BigNumber.from(totalDepositsBob).sub(processedDepositB),
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
    totalDepositsAlice: totalDepositsAlice.toString(),
    totalDepositsBob: totalDepositsBob.toString(),
  });
};
