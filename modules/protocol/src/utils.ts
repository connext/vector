import {
  Balance,
  ChannelUpdate,
  CoreChannelState,
  CreateTransferParams,
  CreateUpdateDetails,
  DepositParams,
  FullChannelState,
  FullTransferState,
  IChannelSigner,
  IVectorChainReader,
  IVectorStore,
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
import { hashChannelCommitment, validateChannelUpdateSignatures } from "@connext/vector-utils";
import Ajv from "ajv";

const ajv = new Ajv();

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const validateSchema = (obj: any, schema: any): undefined | string => {
  const validate = ajv.compile(schema);
  const valid = validate(obj);
  if (!valid) {
    return validate.errors?.map((e) => e.message).join();
  }
  return undefined;
};

// NOTE: If you do *NOT* use this function within the protocol, it becomes
// very difficult to write proper unit tests. When the same utility is imported
// as:
// `import { validateChannelUpdateSignatures } from "@connext/vector-utils"`
// it does not properly register as a mock.
// Is this a silly function? yes. Are tests silly? no.
// Another note: if you move this into the `validate` file, you will have
// problems properly mocking the fn in the validation unit tests. This likely
// has to do with destructuring, but it is unclear.
export async function validateChannelSignatures(
  state: FullChannelState,
  aliceSignature: string | undefined,
  bobSignature: string | undefined,
  requiredSigners: "alice" | "bob" | "both",
): Promise<Result<void, Error>> {
  return validateChannelUpdateSignatures(state, aliceSignature, bobSignature, requiredSigners);
}

export const extractContextFromStore = async (
  storeService: IVectorStore,
  channelAddress: string,
): Promise<
  Result<
    {
      activeTransfers: FullTransferState[];
      channelState: FullChannelState | undefined;
    },
    Error
  >
> => {
  // First, pull all information out from the store
  let activeTransfers: FullTransferState[];
  let channelState: FullChannelState | undefined;
  let storeMethod = "getChannelState";
  try {
    // will always need the previous state
    channelState = await storeService.getChannelState(channelAddress);
    // will only need active transfers for create/resolve
    storeMethod = "getActiveTransfers";
    activeTransfers = await storeService.getActiveTransfers(channelAddress);
  } catch (e) {
    return Result.fail(new Error(`${storeMethod} failed: ${e.message}`));
  }

  return Result.ok({
    activeTransfers,
    channelState,
  });
};

// Channels store `ChannelUpdate<T>` types as the `latestUpdate` field, which
// must be converted to the `UpdateParams<T> when syncing
export function getParamsFromUpdate<T extends UpdateType = any>(update: ChannelUpdate<T>): UpdateParams<T> {
  const { channelAddress, type, details, toIdentifier, assetId } = update;
  let paramDetails: SetupParams | DepositParams | CreateTransferParams | ResolveTransferParams;
  switch (type) {
    case "setup": {
      const { networkContext, timeout, meta } = details as SetupUpdateDetails;
      const params: SetupParams = {
        networkContext: { ...networkContext },
        timeout,
        counterpartyIdentifier: toIdentifier,
        meta: meta ?? {},
      };
      paramDetails = params;
      break;
    }
    case "deposit": {
      const params: DepositParams = {
        channelAddress,
        assetId,
        meta: details.meta ?? {},
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
        meta: meta ?? {},
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
        meta: meta ?? {},
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
      BigNumber.from(initialBalance.amount[0]).add(depositsToReconcile[0]).toString(),
      BigNumber.from(initialBalance.amount[1]).add(depositsToReconcile[1]).toString(),
    ],
  };

  return Result.ok({
    balance,
    totalDepositsAlice: totalDepositsAlice.toString(),
    totalDepositsBob: totalDepositsBob.toString(),
  });
};

export const getUpdatedChannelBalance = (
  type: typeof UpdateType.create | typeof UpdateType.resolve,
  assetId: string,
  balanceToReconcile: Balance,
  state: FullChannelState,
  initiator: string,
): Balance => {
  // Get the existing balances to update
  const assetIdx = state.assetIds.findIndex((a) => a === assetId);
  if (assetIdx === -1) {
    throw new Error(`Asset id not found in channel ${assetId}`);
  }
  const existing = state.balances[assetIdx] || { to: [state.alice, state.bob], amount: ["0", "0"] };

  // Create a helper to update some existing balance amount
  // based on the transfer amount using the update type
  const updateExistingAmount = (existingBalance: string, transferBalance: string): string => {
    return type === UpdateType.create
      ? BigNumber.from(existingBalance).sub(transferBalance).toString()
      : BigNumber.from(existingBalance).add(transferBalance).toString();
  };

  // NOTE: in the transfer.balance, there is no guarantee that the
  // `transfer.to` corresponds to the `channel.balances[assetIdx].to`
  // (i.e. an external withdrawal recipient). However, the transfer
  // will always have an initiator and responder that will correspond
  // to the values of `channel.balances[assetIdx].to`

  // Get the transfer amounts that correspond to channel participants
  const aliceTransferAmount = initiator === state.alice ? balanceToReconcile.amount[0] : balanceToReconcile.amount[1];
  const bobTransferAmount = initiator === state.bob ? balanceToReconcile.amount[0] : balanceToReconcile.amount[1];

  // Return the updated channel balance object
  // NOTE: you should *always* use the existing balance because you are
  // reconciling a transfer balance with a channel balance. The reconciled
  // balance `to` ordering should correspond to the existing state ordering
  // not the transfer.to ordering
  return {
    to: [...existing.to],
    amount: [
      updateExistingAmount(existing.amount[0], aliceTransferAmount),
      updateExistingAmount(existing.amount[1], bobTransferAmount),
    ],
  };
};
