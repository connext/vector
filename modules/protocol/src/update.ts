import {
  getSignerAddressFromPublicIdentifier,
  hashCoreTransferState,
  hashTransferState,
  getTransferId,
} from "@connext/vector-utils";
import { BigNumber, constants, utils } from "ethers";
import {
  UpdateType,
  ChannelUpdate,
  FullChannelState,
  UpdateParams,
  Balance,
  IChannelSigner,
  CoreTransferState,
  Result,
  FullTransferState,
  IVectorOnchainService,
  InboundChannelUpdateError,
  OutboundChannelUpdateError,
} from "@connext/vector-types";
import pino from "pino";
import { MerkleTree } from "merkletreejs";

import { generateSignedChannelCommitment, reconcileDeposit } from "./utils";

// Should return a state with the given update applied
// It is assumed here that the update is validated before
// being passed in. This is called by both inbound and outbound
// functions (i.e. both channel participants). While it returns an
// InboundChannelError, this can be cast to an OutboundChannelError
// at the appropriate level
export async function applyUpdate<T extends UpdateType>(
  update: ChannelUpdate<T>,
  state: FullChannelState<T>,
  transfer?: FullTransferState,
  // Initial state of resolved transfer for calculating
  // updates to locked value needed from store
): Promise<Result<FullChannelState<T>, InboundChannelUpdateError>> {
  switch (update.type) {
    case UpdateType.setup: {
      const { timeout, networkContext } = (update as ChannelUpdate<"setup">).details;
      const publicIdentifiers = [update.fromIdentifier, update.toIdentifier];
      const participants: string[] = publicIdentifiers.map(getSignerAddressFromPublicIdentifier);
      return Result.ok({
        nonce: 1,
        channelAddress: update.channelAddress,
        timeout,
        participants,
        balances: [],
        processedDepositsA: [],
        processedDepositsB: [],
        assetIds: [],
        merkleRoot: constants.HashZero,
        latestUpdate: update,
        networkContext,
        publicIdentifiers,
      });
    }
    case UpdateType.deposit: {
      const { totalDepositedA, totalDepositedB } = (update as ChannelUpdate<"deposit">).details;
      // Generate the new balance field for the channel
      const balances = reconcileBalanceWithExisting(update.balance, update.assetId, state.balances, state.assetIds);
      const { processedDepositsA, processedDepositsB } = reconcileProcessedDepositsWithExisting(
        state.processedDepositsA,
        state.processedDepositsB,
        totalDepositedA,
        totalDepositedB,
        update.assetId,
        state.assetIds,
      );
      const assetIdExists = !!state.assetIds.find((a: string) => a === update.assetId);
      return Result.ok({
        ...state,
        balances,
        processedDepositsA,
        processedDepositsB,
        assetIds: assetIdExists ? state.assetIds : [...state.assetIds, update.assetId],
        nonce: update.nonce,
        latestUpdate: update,
      });
    }
    case UpdateType.create: {
      const { merkleRoot } = (update as ChannelUpdate<"create">).details;
      // Generate the new balance field for the channel
      const balances = reconcileBalanceWithExisting(update.balance, update.assetId, state.balances, state.assetIds);
      return Result.ok({
        ...state,
        balances,
        nonce: update.nonce,
        merkleRoot,
        latestUpdate: update,
      });
    }
    case UpdateType.resolve: {
      const { merkleRoot } = (update as ChannelUpdate<"resolve">).details;
      if (!transfer) {
        return Result.fail(
          new InboundChannelUpdateError(InboundChannelUpdateError.reasons.TransferNotFound, update, state),
        );
      }
      const balances = reconcileBalanceWithExisting(update.balance, update.assetId, state.balances, state.assetIds);
      return Result.ok({
        ...state,
        balances,
        nonce: update.nonce,
        merkleRoot,
        latestUpdate: update,
      });
    }
    default: {
      return Result.fail(new InboundChannelUpdateError(InboundChannelUpdateError.reasons.BadUpdateType, update, state));
    }
  }
}

// This function accepts user given parameters, generates
// a specific update based on the user input, validates the
// generated update, and signs it. To maximize code-reuse,
// all state/update validation should happen in the `validate`
// function, while all parameter validation should happen at
// the API level when the parameters first enter the system.

// It is also important to note that in all of these functions
// we will need to generate a signature for the state that
// would result if these updates are applied. That means that
// the `applyUpdate` function should be used to generate the
// properly validated resultant state
export async function generateUpdate<T extends UpdateType>(
  params: UpdateParams<T>,
  state: FullChannelState | undefined, // passed in to avoid store call
  activeTransfers: FullTransferState[],
  transfer: FullTransferState | undefined, // Defined only in resolve, asserted in validation
  onchainService: IVectorOnchainService,
  signer: IChannelSigner,
  logger: pino.BaseLogger = pino(),
): Promise<
  Result<
    { update: ChannelUpdate<T>; channelState: FullChannelState<T>; transfer: FullTransferState | undefined },
    OutboundChannelUpdateError
  >
> {
  // Create the update from user parameters based on type
  let unsigned: ChannelUpdate<any>;
  let updatedTransfer: FullTransferState | undefined = undefined;
  switch (params.type) {
    case UpdateType.setup: {
      unsigned = generateSetupUpdate(params as UpdateParams<"setup">, signer);
      break;
    }
    case UpdateType.deposit: {
      unsigned = await generateDepositUpdate(
        state!,
        params as UpdateParams<"deposit">,
        signer,
        onchainService,
        logger,
      );
      break;
    }
    case UpdateType.create: {
      const result = generateCreateUpdate(state!, params as UpdateParams<"create">, signer, activeTransfers);
      unsigned = result.unsigned;
      updatedTransfer = result.transfer;
      break;
    }
    case UpdateType.resolve: {
      if (!transfer) {
        return Result.fail(
          new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.TransferNotFound, params, state),
        );
      }
      const result = await generateResolveUpdate(
        state!,
        params as UpdateParams<"resolve">,
        signer,
        activeTransfers,
        onchainService,
        logger,
      );
      unsigned = result.unsigned;
      updatedTransfer = result.transfer;
      break;
    }
    default: {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.BadUpdateType, params, state),
      );
    }
  }

  // Create a signed commitment for the new state
  const result = await applyUpdate(unsigned, state!, updatedTransfer);
  if (result.isError) {
    // Cast to an outbound error (see note in applyUpdate, safe to any cast)
    const inboundError = result.getError()!;
    return Result.fail(new OutboundChannelUpdateError(inboundError.message as any, params, state));
  }
  const commitment = await generateSignedChannelCommitment(result.getValue(), signer, []);

  // Return the validated update to send to counterparty
  return Result.ok({
    update: {
      ...unsigned,
      signatures: commitment.signatures,
    },
    transfer: updatedTransfer,
    channelState: result.getValue(),
  });
}

function generateSetupUpdate(
  params: UpdateParams<"setup">, // already validated
  signer: IChannelSigner,
): ChannelUpdate<"setup"> {
  // During channel creation, you have no channel state, so create
  // the base values
  const publicIdentifiers = [signer.publicIdentifier, params.details.counterpartyIdentifier];
  const participants: string[] = publicIdentifiers.map(getSignerAddressFromPublicIdentifier);

  // TODO: There may have to be a setup signature for the channel
  // when deploying the multisig. will need to generate that here
  // (check with heiko)

  // Create the channel update from the params
  // Don't use `generateBaseUpdate` for initial update
  const unsigned: ChannelUpdate<"setup"> = {
    nonce: 1,
    channelAddress: params.channelAddress,
    type: UpdateType.setup,
    fromIdentifier: signer.publicIdentifier,
    toIdentifier: params.details.counterpartyIdentifier,
    // should have the to field filled out
    balance: { to: participants, amount: ["0", "0"] },
    details: {
      networkContext: params.details.networkContext,
      timeout: params.details.timeout,
    },
    signatures: [],
    assetId: constants.AddressZero,
  };

  return unsigned;
}

// Generates deposit update from user input params.
async function generateDepositUpdate(
  state: FullChannelState,
  params: UpdateParams<"deposit">,
  signer: IChannelSigner,
  onchainService: IVectorOnchainService,
  logger: pino.BaseLogger,
): Promise<ChannelUpdate<"deposit">> {
  // The deposit update has the ability to change the values in
  // the following `FullChannelState` fields:
  // - balances
  // - assetIds
  // - nonce (general update helper)
  // - processedDepositsA
  // - processedDepositsB
  // while the remaining fields are consistent

  // Initiating a deposit update should happen *after* money is
  // sent to the multisig. This means that the `totalDepositedA`
  // will include the latest amount deposited

  // Determine the locked value and existing balance using the
  // assetIdx
  const { assetId } = params.details;
  const assetIdx = state.assetIds.findIndex(a => a === assetId);
  const existingChannelBalance =
    assetIdx === -1 ? { to: state.participants, amount: ["0", "0"] } : state.balances[assetIdx];
  const processedDepositsAOfAssetId = assetIdx === -1 ? "0" : state.processedDepositsA[assetIdx];
  const processedDepositsBOfAssetId = assetIdx === -1 ? "0" : state.processedDepositsB[assetIdx];

  // TODO: dont unwrap, check for error first
  const { balance, totalDepositedA, totalDepositedB } = (
    await reconcileDeposit(
      state.channelAddress,
      state.networkContext.chainId,
      existingChannelBalance,
      processedDepositsAOfAssetId,
      processedDepositsBOfAssetId,
      assetId,
      onchainService,
    )
  ).getValue();

  const unsigned = {
    ...generateBaseUpdate(state, params, signer),
    balance,
    processedDepositsA: totalDepositedA,
    processedDepositsB: totalDepositedB,
    assetId,
    details: { totalDepositedA, totalDepositedB },
    signatures: [],
  };
  return unsigned;
}

// Generates the transfer creation update based on user input
function generateCreateUpdate(
  state: FullChannelState,
  params: UpdateParams<"create">,
  signer: IChannelSigner,
  transfers: CoreTransferState[],
): { unsigned: ChannelUpdate<"create">; transfer: FullTransferState } {
  const {
    details: { assetId, transferDefinition, timeout, encodings, transferInitialState, meta },
  } = params;

  // Creating a transfer is able to effect the following fields
  // on the channel state:
  // - balances
  // - nonce (all)
  // - merkle root

  // First, we must generate the merkle proof for the update
  // which means we must gather the list of open transfers for the channel
  const transferState: FullTransferState = {
    initialBalance: transferInitialState.balance,
    assetId,
    transferId: getTransferId(state.channelAddress, state.nonce.toString(), transferDefinition, timeout),
    channelAddress: state.channelAddress,
    transferDefinition,
    transferEncodings: encodings,
    transferTimeout: timeout,
    initialStateHash: hashTransferState(transferInitialState, encodings[0]),
    transferState: transferInitialState,
    channelFactoryAddress: state.networkContext.channelFactoryAddress,
    chainId: state.networkContext.chainId,
    transferResolver: undefined,
    meta,
  };
  const transferHash = hashCoreTransferState(transferState);
  const hashes = [...transfers, transferState].map(state => {
    return hashCoreTransferState(state);
  });
  const merkle = new MerkleTree(hashes, utils.keccak256);

  // Create the update from the user provided params
  const balance = getUpdatedChannelBalance(UpdateType.create, assetId, transferInitialState.balance, state);
  const root = merkle.getHexRoot();
  const unsigned: ChannelUpdate<"create"> = {
    ...generateBaseUpdate(state, params, signer),
    balance,
    assetId,
    details: {
      transferId: transferState.transferId,
      transferDefinition,
      transferTimeout: timeout,
      transferInitialState,
      transferEncodings: encodings,
      merkleProofData: merkle.getHexProof(Buffer.from(transferHash)),
      merkleRoot: root === "0x" ? constants.HashZero : root,
      meta,
    },
    signatures: [],
  };
  return { transfer: transferState, unsigned };
}

// Generates resolve update from user input params
async function generateResolveUpdate(
  state: FullChannelState,
  params: UpdateParams<"resolve">,
  signer: IChannelSigner,
  transfers: FullTransferState[],
  chainService: IVectorOnchainService,
  logger: pino.BaseLogger,
): Promise<{ unsigned: ChannelUpdate<"resolve">; transfer: FullTransferState }> {
  // A transfer resolution update can effect the following
  // channel fields:
  // - balances
  // - nonce
  // - merkle root

  const { transferId, transferResolver } = params.details;

  // First generate latest merkle tree data
  const transferToResolve = transfers.find(x => x.transferId === transferId);
  if (!transferToResolve) {
    throw new Error(`Could not find transfer for id ${transferId}`);
  }
  const hashes = transfers
    .filter(x => x.transferId !== transferId)
    .map(state => {
      return hashCoreTransferState(state);
    });
  const merkle = new MerkleTree(hashes, hashCoreTransferState);

  // Get the final transfer balance from contract
  const transferBalanceResult = await chainService.resolve(
    { ...transferToResolve, transferResolver },
    state.networkContext.chainId,
    //LinkedTransfer.bytecode, // TODO: include bytecode
  );

  if (transferBalanceResult.isError) {
    throw transferBalanceResult.getError()!;
  }
  const transferBalance = transferBalanceResult.getValue()!;

  // Convert transfer balance to channel update balance
  const balance = getUpdatedChannelBalance(UpdateType.resolve, transferToResolve.assetId, transferBalance, state);

  // Generate the unsigned update from the params
  const root = merkle.getHexRoot();
  const unsigned: ChannelUpdate<"resolve"> = {
    ...generateBaseUpdate(state, params, signer),
    balance,
    assetId: transferToResolve.assetId,
    details: {
      transferId,
      transferDefinition: transferToResolve.transferDefinition,
      transferResolver,
      transferEncodings: transferToResolve.transferEncodings,
      merkleRoot: root === "0x" ? constants.HashZero : root,
    },
    signatures: [],
  };

  return {
    transfer: {
      ...transferToResolve,
      transferState: { ...transferToResolve.transferState, balance: { ...transferBalance } },
      transferResolver: { ...transferResolver },
    },
    unsigned,
  };
}

// Holds the logic that is the same between all update types:
// - increasing channel nonce
// - defining update type
// - channel addressing (participants, address, etc.)
function generateBaseUpdate<T extends UpdateType>(
  state: FullChannelState,
  params: UpdateParams<T>,
  signer: IChannelSigner,
): Pick<ChannelUpdate<T>, "channelAddress" | "nonce" | "fromIdentifier" | "toIdentifier" | "type"> {
  return {
    nonce: state.nonce + 1,
    channelAddress: state.channelAddress,
    type: params.type,
    fromIdentifier: signer.publicIdentifier,
    toIdentifier: state.publicIdentifiers.find(id => id !== signer.publicIdentifier)!,
  };
}

function getUpdatedChannelBalance(
  type: typeof UpdateType.create | typeof UpdateType.resolve,
  assetId: string,
  balanceToReconcile: Balance,
  state: FullChannelState,
): Balance {
  // Get the existing balances to update
  const assetIdx = state.assetIds.findIndex(a => a === assetId);
  if (assetIdx === -1) {
    throw new Error(`Asset id not found in channel ${assetId}`);
  }
  const existing = state.balances[assetIdx] || { to: state.participants, amount: ["0", "0"] };

  // Create a helper to update some existing balance amount
  // based on the transfer amount using the update type
  const updateExistingAmount = (existing: string, update: string): string => {
    return type === UpdateType.create
      ? BigNumber.from(existing)
          .sub(update)
          .toString()
      : BigNumber.from(existing)
          .add(update)
          .toString();
  };

  // NOTE: in the transfer.balance, there is no guarantee that the
  // `transfer.to` corresponds to the `channel.balances[assetIdx].to`
  // (i.e. an external withdrawal recipient)

  // Create an array holding the appropriate index in the transfer
  // balance.to for the existing balance.to
  const existingToIndexes = balanceToReconcile.to.map(addr => existing.to.findIndex(a => a === addr));

  // Create an updated amount
  const updatedAmount = existingToIndexes
    .map(existingIdx => {
      if (existingIdx == -1) {
        // the balance.to value is not in the existing.to value,
        // so there is no corresponding channel balance update
        return undefined;
      }
      // balance.to is a channel participant, so update the
      // corresponding amount
      const balanceIdx = balanceToReconcile.to.findIndex(a => a === existing.to[existingIdx]);
      return updateExistingAmount(existing.amount[existingIdx], balanceToReconcile.amount[balanceIdx]);
    })
    .filter(x => !!x) as string[];

  // NOTE: you should *always* use the existing balance because you are
  // reconciling a transfer balance with a channel balance. The reconciled
  // balance `to` ordering should correspond to the existing state ordering
  // not the transfer.to ordering
  return {
    to: [...existing.to],
    amount: updatedAmount,
  };
}

// Updates the existing state balances with the proposed balance
// from the update (generated from `getUpdatedBalance`)
function reconcileBalanceWithExisting(
  balanceToReconcile: Balance,
  assetToReconcile: string,
  existing: Balance[],
  assetIds: string[],
): Balance[] {
  // Update the balances array at the appropriate index
  const assetIdx = assetIds.findIndex(a => a === assetToReconcile);
  if (assetIdx === -1) {
    // Add new balance to array (new asset id)
    return [...existing, balanceToReconcile];
  }

  // Otherwise, update the array at the given index
  const updated = [...existing];
  updated[assetIdx] = balanceToReconcile;
  return updated;
}

function reconcileProcessedDepositsWithExisting(
  existingProcessedDepositsA: string[],
  existingProcessedDepositsB: string[],
  depositToReconcileA: string,
  depositToReconcileB: string,
  assetToReconcile: string,
  assetIds: string[],
): { processedDepositsA: string[]; processedDepositsB: string[] } {
  // Update the arrays at the appropriate index
  const assetIdx = assetIds.findIndex(a => a === assetToReconcile);
  if (assetIdx === -1) {
    // Add new deposit to array (new asset id)
    return {
      processedDepositsA: [...existingProcessedDepositsA, depositToReconcileA],
      processedDepositsB: [...existingProcessedDepositsB, depositToReconcileB],
    };
  }

  // Otherwise, update the array at the given index
  const updatedA = [...existingProcessedDepositsA];
  const updatedB = [...existingProcessedDepositsB];
  updatedA[assetIdx] = depositToReconcileA;
  updatedB[assetIdx] = depositToReconcileB;
  return { processedDepositsA: updatedA, processedDepositsB: updatedB };
}
