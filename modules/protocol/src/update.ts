import {
  getSignerAddressFromPublicIdentifier,
  hashTransferState,
  getTransferId,
  generateMerkleTreeData,
} from "@connext/vector-utils";
import {
  UpdateType,
  ChannelUpdate,
  FullChannelState,
  UpdateParams,
  Balance,
  IChannelSigner,
  Result,
  FullTransferState,
  IVectorChainReader,
  SetupUpdateDetails,
  DepositUpdateDetails,
  CreateUpdateDetails,
  ResolveUpdateDetails,
  jsonifyError,
} from "@connext/vector-types";
import { getAddress } from "@ethersproject/address";
import { HashZero, AddressZero } from "@ethersproject/constants";
import { BaseLogger } from "pino";

import { ApplyUpdateError, CreateUpdateError } from "./errors";
import { generateSignedChannelCommitment, getUpdatedChannelBalance, mergeAssetIds, reconcileDeposit } from "./utils";

// Should return a state with the given update applied
// It is assumed here that the update is validated before
// being passed in. This is called by both inbound and outbound
// functions (i.e. both channel participants). While it returns an
// InboundChannelError, this can be cast to an OutboundChannelError
// at the appropriate level. This is used by both parties to consolidate
// the update/state transformation logic.

// NOTE: resolve is a bit annoying -- it requires the contract to be
// called to get the final transfer state and channel balance for the
// update. Because this is an onchain operation, we do not want to perform
// this more than necessary. Because validation is performed
// *before* this function is called, both parties will pass in the final
// transferState to the function to make sure the operation is called only
// once by both parties.
export function applyUpdate<T extends UpdateType>(
  update: ChannelUpdate<T>,
  previousState: FullChannelState | undefined, // undefined only on setup
  previousActiveTransfers: FullTransferState[],
  finalTransferBalance: Balance | undefined, // defined only on resolve
): Result<
  {
    updatedChannel: FullChannelState;
    updatedActiveTransfers: FullTransferState[];
    updatedTransfer?: FullTransferState;
  },
  ApplyUpdateError
> {
  const { type, details, channelAddress, fromIdentifier, toIdentifier, balance, assetId, nonce } = update;

  const assetIdx = (previousState?.assetIds ?? []).findIndex((a) => getAddress(a) === getAddress(assetId));

  // Sanity check data presence so it is safe to force-unwrap
  if (!previousState && type !== UpdateType.setup) {
    return Result.fail(new ApplyUpdateError(ApplyUpdateError.reasons.ChannelNotFound, update, previousState));
  }
  if (!finalTransferBalance && type === UpdateType.resolve) {
    return Result.fail(new ApplyUpdateError(ApplyUpdateError.reasons.MissingFinalBalance, update, previousState));
  }

  switch (type) {
    case UpdateType.setup: {
      const { timeout, networkContext } = details as SetupUpdateDetails;
      return Result.ok({
        updatedActiveTransfers: [...previousActiveTransfers],
        updatedChannel: {
          nonce: 1,
          channelAddress,
          timeout,
          alice: getSignerAddressFromPublicIdentifier(fromIdentifier),
          bob: getSignerAddressFromPublicIdentifier(toIdentifier),
          balances: [],
          processedDepositsA: [],
          processedDepositsB: [],
          assetIds: [],
          defundNonces: [],
          merkleRoot: HashZero,
          latestUpdate: update,
          networkContext,
          aliceIdentifier: fromIdentifier,
          bobIdentifier: toIdentifier,
          inDispute: false,
        },
      });
    }
    case UpdateType.deposit: {
      const { totalDepositsAlice, totalDepositsBob } = details as DepositUpdateDetails;
      // Generate the new balance field for the channel
      const balances = reconcileBalanceWithExisting(balance, assetId, previousState!.balances, previousState!.assetIds);
      const { processedDepositsA, processedDepositsB } = reconcileProcessedDepositsWithExisting(
        previousState!.processedDepositsA,
        previousState!.processedDepositsB,
        totalDepositsAlice,
        totalDepositsBob,
        assetId,
        previousState!.assetIds,
      );

      // NOTE: prior to v0.1.8-beta.6 there were inconsistent checks
      // with checksummed and non-checksummed assetIds resulting in
      // some channels having 2 assetId entries (one lowercase and one
      // checksum, for example) for the same asset. calling `mergeAssets`
      // will create the correct balance/processed deposit entries for
      // all duplicated assetIds
      const updatedChannel = {
        ...previousState!,
        balances,
        processedDepositsA,
        processedDepositsB,
        assetIds: assetIdx !== -1 ? previousState!.assetIds : [...previousState!.assetIds, assetId],
        defundNonces: assetIdx !== -1 ? [...previousState!.defundNonces] : [...previousState!.defundNonces, "1"],
        nonce,
        latestUpdate: update,
      };
      return Result.ok({
        updatedActiveTransfers: [...previousActiveTransfers],
        updatedChannel: mergeAssetIds(updatedChannel),
      });
    }
    case UpdateType.create: {
      const {
        merkleRoot,
        transferInitialState,
        transferDefinition,
        transferTimeout,
        meta,
        transferId,
        balance: transferBalance,
        transferEncodings,
      } = details as CreateUpdateDetails;
      // Generate the new balance field for the channel
      const balances = reconcileBalanceWithExisting(balance, assetId, previousState!.balances, previousState!.assetIds);
      const updatedChannel = {
        ...previousState!,
        balances,
        nonce,
        merkleRoot,
        latestUpdate: update,
      };
      const initiator = getSignerAddressFromPublicIdentifier(update.fromIdentifier);
      const createdTransfer = {
        balance: transferBalance,
        assetId,
        transferId,
        channelAddress,
        transferDefinition,
        transferEncodings,
        transferTimeout,
        initialStateHash: hashTransferState(transferInitialState, transferEncodings[0]),
        transferState: transferInitialState,
        channelFactoryAddress: previousState!.networkContext.channelFactoryAddress,
        chainId: previousState!.networkContext.chainId,
        transferResolver: undefined,
        initiator,
        responder: initiator === previousState!.alice ? previousState!.bob : previousState!.alice,
        meta: { ...(meta ?? {}), createdAt: Date.now() },
        inDispute: false,
        channelNonce: previousState!.nonce,
        initiatorIdentifier: update.fromIdentifier,
        responderIdentifier: update.toIdentifier,
      };
      return Result.ok({
        updatedChannel,
        updatedTransfer: createdTransfer,
        updatedActiveTransfers: [...previousActiveTransfers, createdTransfer],
      });
    }
    case UpdateType.resolve: {
      const { merkleRoot, transferId, transferResolver, meta } = details as ResolveUpdateDetails;
      // Safe to force unwrap because the validation has been performed
      const transfer = previousActiveTransfers!.find((t) => t.transferId === transferId);
      if (!transfer) {
        return Result.fail(new ApplyUpdateError(ApplyUpdateError.reasons.TransferNotActive, update, previousState));
      }
      const balances = reconcileBalanceWithExisting(balance, assetId, previousState!.balances, previousState!.assetIds);
      const updatedChannel = {
        ...previousState!,
        balances,
        nonce,
        merkleRoot,
        latestUpdate: update,
      };
      const resolvedTransfer = {
        ...transfer,
        transferState: { ...transfer.transferState, balance: { ...finalTransferBalance } },
        transferResolver: { ...transferResolver },
        balance: finalTransferBalance!,
        meta: {
          ...(transfer.meta ?? {}),
          ...(meta ?? {}),
          resolvedAt: Date.now(),
        },
      };
      return Result.ok({
        updatedChannel,
        updatedTransfer: resolvedTransfer,
        updatedActiveTransfers: previousActiveTransfers.filter((t) => t.transferId !== transferId),
      });
    }
    default: {
      return Result.fail(new ApplyUpdateError(ApplyUpdateError.reasons.BadUpdateType, update, previousState));
    }
  }
}

// This function accepts user given parameters, generates
// a specific update based on the user input, creates the
// generated update, applies it, signs it, and returns all updated.
// information. All validation is performed in the before this function is
// called (parameter structure validation is performed at API level
// and contextual validation is performed within `sync.outbound`)
export async function generateAndApplyUpdate<T extends UpdateType>(
  signer: IChannelSigner,
  chainReader: IVectorChainReader,
  params: UpdateParams<T>,
  previousState: FullChannelState | undefined, // undefined IFF setup
  activeTransfers: FullTransferState[],
  initiatorIdentifier: string,
  logger?: BaseLogger,
): Promise<
  Result<
    {
      update: ChannelUpdate<T>;
      updatedChannel: FullChannelState;
      updatedActiveTransfers: FullTransferState[];
      updatedTransfer: FullTransferState | undefined;
    },
    CreateUpdateError
  >
> {
  // Create the update from user parameters based on update type
  let proposedUpdate: ChannelUpdate;
  // The transfer balance after resolve is pulled from the
  // transfer definition onchain. This balance is required for
  // generating the channel update, as well as for applying the
  // update.
  let finalTransferBalance: Balance | undefined = undefined;
  switch (params.type) {
    case UpdateType.setup: {
      proposedUpdate = generateSetupUpdate(params as UpdateParams<"setup">, initiatorIdentifier);
      break;
    }
    case UpdateType.deposit: {
      const depositRes = await generateDepositUpdate(
        previousState!,
        params as UpdateParams<"deposit">,
        signer,
        chainReader,
        initiatorIdentifier,
      );
      if (depositRes.isError) {
        return Result.fail(depositRes.getError()!);
      }
      proposedUpdate = depositRes.getValue();
      break;
    }
    case UpdateType.create: {
      const createRes = await generateCreateUpdate(
        previousState!,
        params as UpdateParams<"create">,
        signer,
        activeTransfers,
        chainReader,
        initiatorIdentifier,
      );
      if (createRes.isError) {
        return Result.fail(createRes.getError()!);
      }
      proposedUpdate = createRes.getValue();
      break;
    }
    case UpdateType.resolve: {
      // See note re: resolve in `applyUpdate` for why this has a
      // different return signature
      const resolveRes = await generateResolveUpdate(
        previousState!,
        params as UpdateParams<"resolve">,
        signer,
        activeTransfers,
        chainReader,
        initiatorIdentifier,
      );
      if (resolveRes.isError) {
        return Result.fail(resolveRes.getError()!);
      }
      const resolve = resolveRes.getValue();
      proposedUpdate = resolve.update;
      finalTransferBalance = resolve.transferBalance;
      break;
    }
    default: {
      return Result.fail(new CreateUpdateError(CreateUpdateError.reasons.BadUpdateType, params, previousState));
    }
  }

  // Create a signed commitment for the new state. `applyUpdate` will also
  // return any updated transfers/active transfers
  const applyUpdateRes = applyUpdate(proposedUpdate, previousState, activeTransfers, finalTransferBalance);
  if (applyUpdateRes.isError) {
    const applyError = applyUpdateRes.getError()!;
    const { state, params, ...res } = applyError.context;
    return Result.fail(
      new CreateUpdateError(CreateUpdateError.reasons.CouldNotApplyUpdate, params, state, {
        applyUpdateError: applyError.message,
        applyUpdateContext: res,
      }),
    );
  }
  // Get all updated values
  const { updatedChannel, updatedTransfer, updatedActiveTransfers } = applyUpdateRes.getValue();
  // Sign updated channel
  const commitmentRes = await generateSignedChannelCommitment(updatedChannel, signer, undefined, undefined, logger);
  if (commitmentRes.isError) {
    return Result.fail(
      new CreateUpdateError(CreateUpdateError.reasons.CouldNotSign, params, previousState, {
        signatureError: commitmentRes.getError()!.message,
      }),
    );
  }
  const { aliceSignature, bobSignature } = commitmentRes.getValue();
  // Add signature to update and return
  return Result.ok({
    update: { ...proposedUpdate, aliceSignature, bobSignature },
    updatedChannel,
    updatedActiveTransfers,
    updatedTransfer,
  });
}

function generateSetupUpdate(
  params: UpdateParams<"setup">, // already validated
  initiatorIdentifier: string,
): ChannelUpdate<"setup"> {
  // During channel creation, you have no channel state, so create
  // the base values
  const publicIdentifiers = [initiatorIdentifier, params.details.counterpartyIdentifier];
  const participants: string[] = publicIdentifiers.map(getSignerAddressFromPublicIdentifier);

  // Create the channel update from the params
  // Don't use `generateBaseUpdate` for initial update
  const unsigned: ChannelUpdate<"setup"> = {
    nonce: 1,
    channelAddress: params.channelAddress,
    type: UpdateType.setup,
    fromIdentifier: initiatorIdentifier,
    toIdentifier: params.details.counterpartyIdentifier,
    // should have the to field filled out
    balance: { to: participants, amount: ["0", "0"] },
    details: {
      networkContext: params.details.networkContext,
      timeout: params.details.timeout,
      meta: params.details.meta ?? {},
    },
    assetId: AddressZero,
  };

  return unsigned;
}

// Generates deposit update from user input params.
async function generateDepositUpdate(
  state: FullChannelState,
  params: UpdateParams<"deposit">,
  signer: IChannelSigner,
  chainReader: IVectorChainReader,
  initiatorIdentifier: string,
): Promise<Result<ChannelUpdate<"deposit">, CreateUpdateError>> {
  // The deposit update has the ability to change the values in
  // the following `FullChannelState` fields:
  // - balances
  // - assetIds
  // - nonce (general update helper)
  // - processedDepositsA
  // - processedDepositsB
  // while the remaining fields are consistent

  // Initiating a deposit update should happen *after* money is
  // sent to the multisig. This means that the `totalDepositsAlice`
  // will include the latest amount deposited

  // Determine the locked value and existing balance using the
  // assetIdx
  const { assetId } = params.details;
  const assetIdx = state.assetIds.findIndex((a) => getAddress(a) === getAddress(assetId));
  const existingChannelBalance =
    assetIdx === -1 ? { to: [state.alice, state.bob], amount: ["0", "0"] } : state.balances[assetIdx];
  const processedDepositsAOfAssetId = assetIdx === -1 ? "0" : state.processedDepositsA[assetIdx];
  const processedDepositsBOfAssetId = assetIdx === -1 ? "0" : state.processedDepositsB[assetIdx];

  const reconcileRes = await reconcileDeposit(
    state.channelAddress,
    state.networkContext.chainId,
    existingChannelBalance,
    processedDepositsAOfAssetId,
    processedDepositsBOfAssetId,
    assetId,
    chainReader,
  );
  if (reconcileRes.isError) {
    return Result.fail(
      new CreateUpdateError(CreateUpdateError.reasons.FailedToReconcileDeposit, params, state, {
        reconcileError: jsonifyError(reconcileRes.getError()!),
      }),
    );
  }

  const { balance, totalDepositsAlice, totalDepositsBob } = reconcileRes.getValue();

  const unsigned = {
    ...generateBaseUpdate(state, params, signer, initiatorIdentifier),
    balance,
    processedDepositsA: totalDepositsAlice,
    processedDepositsB: totalDepositsBob,
    assetId,
    details: { totalDepositsAlice, totalDepositsBob, meta: params.details.meta ?? {} },
  };
  return Result.ok(unsigned);
}

// Generates the transfer creation update based on user input
async function generateCreateUpdate(
  state: FullChannelState,
  params: UpdateParams<"create">,
  signer: IChannelSigner,
  transfers: FullTransferState[],
  chainReader: IVectorChainReader,
  initiatorIdentifier: string,
): Promise<Result<ChannelUpdate<"create">, CreateUpdateError>> {
  const {
    details: { assetId, transferDefinition, timeout, transferInitialState, meta, balance },
  } = params;

  // Creating a transfer is able to effect the following fields
  // on the channel state:
  // - balances
  // - nonce (all)
  // - merkle root

  // FIXME: This will fail if the transfer registry address changes during
  // the lifetime of the channel. We can fix this by either including the
  // chain addresses in the protocol, putting those within the chain-
  // reader itself, or including them in the create update params
  // FIXME: this limitation also means we can never pass in the bytecode
  // (which is used to execute pure-evm calls) since that exists within
  // the chain addresses.
  const registryRes = await chainReader.getRegisteredTransferByDefinition(
    transferDefinition,
    state.networkContext.transferRegistryAddress,
    state.networkContext.chainId,
  );
  if (registryRes.isError) {
    return Result.fail(
      new CreateUpdateError(CreateUpdateError.reasons.TransferNotRegistered, params, state, {
        registryError: jsonifyError(registryRes.getError()!),
      }),
    );
  }

  const { stateEncoding, resolverEncoding } = registryRes.getValue();

  // First, we must generate the merkle proof for the update
  // which means we must gather the list of open transfers for the channel
  const initialStateHash = hashTransferState(transferInitialState, stateEncoding);
  const counterpartyId = signer.address === state.alice ? state.bobIdentifier : state.aliceIdentifier;
  const counterpartyAddr = signer.address === state.alice ? state.bob : state.alice;
  const transferState: FullTransferState = {
    balance,
    assetId,
    transferId: getTransferId(state.channelAddress, state.nonce.toString(), transferDefinition, timeout),
    channelAddress: state.channelAddress,
    transferDefinition,
    transferEncodings: [stateEncoding, resolverEncoding],
    transferTimeout: timeout,
    initialStateHash,
    transferState: transferInitialState,
    channelFactoryAddress: state.networkContext.channelFactoryAddress,
    chainId: state.networkContext.chainId,
    transferResolver: undefined,
    initiator: getSignerAddressFromPublicIdentifier(initiatorIdentifier),
    responder: signer.publicIdentifier === initiatorIdentifier ? counterpartyAddr : signer.address,
    meta: { ...(meta ?? {}), createdAt: Date.now() },
    inDispute: false,
    channelNonce: state.nonce,
    initiatorIdentifier,
    responderIdentifier: signer.publicIdentifier === initiatorIdentifier ? counterpartyId : signer.address,
  };
  const { proof, root } = generateMerkleTreeData([...transfers, transferState], transferState);

  // Create the update from the user provided params
  const channelBalance = getUpdatedChannelBalance(UpdateType.create, assetId, balance, state, transferState.initiator);
  const unsigned: ChannelUpdate<"create"> = {
    ...generateBaseUpdate(state, params, signer, initiatorIdentifier),
    balance: channelBalance,
    assetId,
    details: {
      transferId: transferState.transferId,
      transferDefinition,
      transferTimeout: timeout,
      balance,
      transferInitialState,
      transferEncodings: [stateEncoding, resolverEncoding],
      merkleProofData: proof!,
      merkleRoot: root,
      meta: { ...(meta ?? {}), createdAt: Date.now() },
    },
  };
  return Result.ok(unsigned);
}

// Generates resolve update from user input params
async function generateResolveUpdate(
  state: FullChannelState,
  params: UpdateParams<"resolve">,
  signer: IChannelSigner,
  transfers: FullTransferState[],
  chainService: IVectorChainReader,
  initiatorIdentifier: string,
): Promise<Result<{ update: ChannelUpdate<"resolve">; transferBalance: Balance }, CreateUpdateError>> {
  // A transfer resolution update can effect the following
  // channel fields:
  // - balances
  // - nonce
  // - merkle root

  const { transferId, transferResolver, meta } = params.details;

  // First generate latest merkle tree data
  const transferToResolve = transfers.find((x) => x.transferId === transferId);
  if (!transferToResolve) {
    return Result.fail(
      new CreateUpdateError(CreateUpdateError.reasons.TransferNotActive, params, state, {
        active: transfers.map((t) => t.transferId),
      }),
    );
  }
  const { root } = generateMerkleTreeData(transfers.filter((x) => x.transferId !== transferId));

  // Get the final transfer balance from contract
  const transferBalanceResult = await chainService.resolve(
    { ...transferToResolve, transferResolver },
    state.networkContext.chainId,
  );

  if (transferBalanceResult.isError) {
    return Result.fail(
      new CreateUpdateError(CreateUpdateError.reasons.FailedToResolveTransferOnchain, params, state, {
        resolveError: jsonifyError(transferBalanceResult.getError()!),
      }),
    );
  }
  const transferBalance = transferBalanceResult.getValue();

  // Convert transfer balance to channel update balance
  const balance = getUpdatedChannelBalance(
    UpdateType.resolve,
    transferToResolve.assetId,
    transferBalance,
    state,
    transferToResolve.initiator,
  );

  const unsigned: ChannelUpdate<"resolve"> = {
    ...generateBaseUpdate(state, params, signer, initiatorIdentifier),
    balance,
    assetId: transferToResolve.assetId,
    details: {
      transferId,
      transferDefinition: transferToResolve.transferDefinition,
      transferResolver,
      merkleRoot: root,
      meta: { ...(transferToResolve.meta ?? {}), ...(meta ?? {}) },
    },
  };

  return Result.ok({ update: unsigned, transferBalance });
}

// Holds the logic that is the same between all update types:
// - increasing channel nonce
// - defining update type
// - channel addressing (participants, address, etc.)
function generateBaseUpdate<T extends UpdateType>(
  state: FullChannelState,
  params: UpdateParams<T>,
  signer: IChannelSigner,
  initiatorIdentifier: string,
): Pick<ChannelUpdate<T>, "channelAddress" | "nonce" | "fromIdentifier" | "toIdentifier" | "type"> {
  const isInitiator = signer.publicIdentifier === initiatorIdentifier;
  const counterparty = signer.publicIdentifier === state.bobIdentifier ? state.aliceIdentifier : state.bobIdentifier;
  return {
    nonce: state.nonce + 1,
    channelAddress: state.channelAddress,
    type: params.type,
    fromIdentifier: initiatorIdentifier,
    toIdentifier: isInitiator ? counterparty : signer.publicIdentifier,
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
  const assetIdx = assetIds.findIndex((a) => getAddress(a) === getAddress(assetToReconcile));
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
  const assetIdx = assetIds.findIndex((a) => getAddress(a) === getAddress(assetToReconcile));
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
