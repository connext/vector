import {
  getSignerAddressFromPublicIdentifier,
  hashCoreTransferState,
  hashTransferState,
  getTransferId,
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
  InboundChannelUpdateError,
  OutboundChannelUpdateError,
  SetupUpdateDetails,
  DepositUpdateDetails,
  CreateUpdateDetails,
  ResolveUpdateDetails,
} from "@connext/vector-types";
import { HashZero, AddressZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/keccak256";
import { BigNumber } from "@ethersproject/bignumber";
import pino from "pino";
import { MerkleTree } from "merkletreejs";

import { generateSignedChannelCommitment, reconcileDeposit } from "./utils";

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
export async function applyUpdate<T extends UpdateType>(
  update: ChannelUpdate<T>,
  previousState: FullChannelState | undefined, // undefined only on setup
  previousActiveTransfers: FullTransferState[] | undefined, // defined on create/resolve
  finalTransferBalance: Balance | undefined, // defined only on resolve
): Promise<
  Result<
    {
      updatedChannel: FullChannelState<T>;
      updatedActiveTransfers?: FullTransferState[];
      updatedTransfer?: FullTransferState;
    },
    InboundChannelUpdateError
  >
> {
  const { type, details, channelAddress, fromIdentifier, toIdentifier, balance, assetId, nonce } = update;

  const assetIdx = (previousState?.assetIds ?? []).findIndex((a) => a === assetId);

  // Sanity check data presence so it is safe to force-unwrap
  if (!previousState && type !== UpdateType.setup) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.ApplyUpdateFailed, update, previousState, {
        applyError: "No previous state found",
      }),
    );
  }
  if (!finalTransferBalance && type === UpdateType.resolve) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.ApplyUpdateFailed, update, previousState, {
        applyError: "No final transfer balance on resolve",
      }),
    );
  }
  const needsActive = type === UpdateType.create || type === UpdateType.resolve;
  if (needsActive && !previousActiveTransfers) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.ApplyUpdateFailed, update, previousState, {
        applyError: "No final transfer balance on resolve",
      }),
    );
  }

  switch (type) {
    case UpdateType.setup: {
      const { timeout, networkContext } = details as SetupUpdateDetails;
      return Result.ok({
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
      return Result.ok({
        updatedChannel: {
          ...previousState!,
          balances,
          processedDepositsA,
          processedDepositsB,
          assetIds: assetIdx !== -1 ? previousState!.assetIds : [...previousState!.assetIds, assetId],
          defundNonces: assetIdx !== -1 ? [...previousState!.defundNonces] : [...previousState!.defundNonces, "1"],
          nonce,
          latestUpdate: update,
        },
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
        meta,
        inDispute: false,
      };
      return Result.ok({
        updatedChannel,
        updatedTransfer: createdTransfer,
        updatedActiveTransfers: [...previousActiveTransfers!, createdTransfer],
      });
    }
    case UpdateType.resolve: {
      const { merkleRoot, transferId, transferResolver, meta } = details as ResolveUpdateDetails;
      // Safe to force unwrap because the validation has been performed
      const transfer = previousActiveTransfers!.find((t) => t.transferId === transferId);
      if (!transfer) {
        return Result.fail(
          new InboundChannelUpdateError(InboundChannelUpdateError.reasons.TransferNotFound, update, previousState, {
            applyError: "No transfer found in activeTransfers",
          }),
        );
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
        meta: {
          ...transfer.meta,
          ...(meta ?? {}),
        },
      };
      return Result.ok({
        updatedChannel,
        updatedTransfer: resolvedTransfer,
        updatedActiveTransfers: previousActiveTransfers!.filter((t) => t.transferId !== transferId),
      });
    }
    default: {
      return Result.fail(
        new InboundChannelUpdateError(InboundChannelUpdateError.reasons.BadUpdateType, update, previousState),
      );
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
  activeTransfers: FullTransferState[] | undefined, // defined IFF create/resolve
  logger: pino.BaseLogger,
): Promise<
  Result<
    {
      update: ChannelUpdate<T>;
      updatedChannel: FullChannelState<T>;
      updatedActiveTransfers: FullTransferState[] | undefined;
      updatedTransfer: FullTransferState | undefined;
    },
    OutboundChannelUpdateError
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
      proposedUpdate = generateSetupUpdate(params as UpdateParams<"setup">, signer);
      break;
    }
    case UpdateType.deposit: {
      const depositRes = await generateDepositUpdate(
        previousState!,
        params as UpdateParams<"deposit">,
        signer,
        chainReader,
        logger,
      );
      if (depositRes.isError) {
        return Result.fail(
          new OutboundChannelUpdateError(depositRes.getError()!.message as any, params, previousState),
        );
      }
      proposedUpdate = depositRes.getValue();
      break;
    }
    case UpdateType.create: {
      const createRes = await generateCreateUpdate(
        previousState!,
        params as UpdateParams<"create">,
        signer,
        activeTransfers!,
        chainReader,
      );
      if (createRes.isError) {
        return Result.fail(new OutboundChannelUpdateError(createRes.getError()!.message as any, params, previousState));
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
        activeTransfers!,
        chainReader,
        logger,
      );
      if (resolveRes.isError) {
        return Result.fail(
          new OutboundChannelUpdateError(resolveRes.getError()!.message as any, params, previousState),
        );
      }
      const resolve = resolveRes.getValue();
      proposedUpdate = resolve.update;
      finalTransferBalance = resolve.transferBalance;
      break;
    }
    default: {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.BadUpdateType, params, previousState),
      );
    }
  }

  // Create a signed commitment for the new state. `applyUpdate` will also
  // return any updated transfers/active transfers
  const applyUpdateRes = await applyUpdate(proposedUpdate, previousState, activeTransfers, finalTransferBalance);
  if (applyUpdateRes.isError) {
    const inboundError = applyUpdateRes.getError()!;
    return Result.fail(new OutboundChannelUpdateError(inboundError.message as any, params, previousState));
  }
  // Get all updated values
  const { updatedChannel, updatedTransfer, updatedActiveTransfers } = applyUpdateRes.getValue();
  // Sign updated channel
  const commitmentRes = await generateSignedChannelCommitment(updatedChannel, signer);
  if (commitmentRes.isError) {
    return Result.fail(new OutboundChannelUpdateError(commitmentRes.getError()?.message as any, params, previousState));
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
  signer: IChannelSigner,
): ChannelUpdate<"setup"> {
  // During channel creation, you have no channel state, so create
  // the base values
  const publicIdentifiers = [signer.publicIdentifier, params.details.counterpartyIdentifier];
  const participants: string[] = publicIdentifiers.map(getSignerAddressFromPublicIdentifier);

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
  logger: pino.BaseLogger,
): Promise<Result<ChannelUpdate<"deposit">, Error>> {
  logger.debug(params, "Generating deposit update from params");
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
  const assetIdx = state.assetIds.findIndex((a) => a === assetId);
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
    return Result.fail(reconcileRes.getError()!);
  }

  const { balance, totalDepositsAlice, totalDepositsBob } = reconcileRes.getValue();

  const unsigned = {
    ...generateBaseUpdate(state, params, signer),
    balance,
    processedDepositsA: totalDepositsAlice,
    processedDepositsB: totalDepositsBob,
    assetId,
    details: { totalDepositsAlice, totalDepositsBob },
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
): Promise<Result<ChannelUpdate<"create">, OutboundChannelUpdateError>> {
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
      new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.TransferNotRegistered, params, state, {
        chainError: registryRes.getError()!.message,
      }),
    );
  }

  const { stateEncoding, resolverEncoding } = registryRes.getValue()!;

  // First, we must generate the merkle proof for the update
  // which means we must gather the list of open transfers for the channel
  const initialStateHash = hashTransferState(transferInitialState, stateEncoding);
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
    initiator: signer.address,
    responder: signer.address === state.alice ? state.bob : state.alice,
    meta,
    inDispute: false,
  };
  const transferHash = hashCoreTransferState(transferState);
  const updatedTransfers = [...transfers, transferState];
  const hashes = updatedTransfers.map((state) => {
    return hashCoreTransferState(state);
  });
  const merkle = new MerkleTree(hashes, keccak256);

  // Create the update from the user provided params
  const channelBalance = getUpdatedChannelBalance(UpdateType.create, assetId, balance, state, transferState.initiator);
  const root = merkle.getHexRoot();
  const unsigned: ChannelUpdate<"create"> = {
    ...generateBaseUpdate(state, params, signer),
    balance: channelBalance,
    assetId,
    details: {
      transferId: transferState.transferId,
      transferDefinition,
      transferTimeout: timeout,
      balance,
      transferInitialState,
      transferEncodings: [stateEncoding, resolverEncoding],
      merkleProofData: merkle.getHexProof(Buffer.from(transferHash)),
      merkleRoot: root === "0x" ? HashZero : root,
      meta,
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
  logger: pino.BaseLogger,
): Promise<Result<{ update: ChannelUpdate<"resolve">; transferBalance: Balance }, Error>> {
  // A transfer resolution update can effect the following
  // channel fields:
  // - balances
  // - nonce
  // - merkle root

  const { transferId, transferResolver, meta } = params.details;

  // First generate latest merkle tree data
  const transferToResolve = transfers.find((x) => x.transferId === transferId);
  logger.info(
    { method: "generateResolveUpdate", numTransfers: transfers.length, channelAddress: state.channelAddress },
    "Generating resolve update",
  );
  if (!transferToResolve) {
    return Result.fail(new Error(OutboundChannelUpdateError.reasons.TransferNotActive));
  }
  const updatedTransfers = transfers.filter((x) => x.transferId !== transferId);
  const hashes = updatedTransfers.map((state) => {
    return hashCoreTransferState(state);
  });
  const merkle = new MerkleTree(hashes, keccak256);

  // Get the final transfer balance from contract
  const transferBalanceResult = await chainService.resolve(
    { ...transferToResolve, transferResolver },
    state.networkContext.chainId,
  );

  if (transferBalanceResult.isError) {
    return Result.fail(transferBalanceResult.getError()!);
  }
  const transferBalance = transferBalanceResult.getValue();
  logger.info(
    {
      method: "generateResolveUpdate",
      channelAddress: state.channelAddress,
      transferBalance,
    },
    "Generated transfer resolution",
  );

  // Convert transfer balance to channel update balance
  const balance = getUpdatedChannelBalance(
    UpdateType.resolve,
    transferToResolve.assetId,
    transferBalance,
    state,
    transferToResolve.initiator,
  );

  // Generate the unsigned update from the params
  const root = merkle.getHexRoot();
  logger.info(
    {
      method: "generateResolveUpdate",
      channelAddress: state.channelAddress,
      root,
    },
    "Generated new merkle root",
  );
  const unsigned: ChannelUpdate<"resolve"> = {
    ...generateBaseUpdate(state, params, signer),
    balance,
    assetId: transferToResolve.assetId,
    details: {
      transferId,
      transferDefinition: transferToResolve.transferDefinition,
      transferResolver,
      merkleRoot: root === "0x" ? HashZero : root,
      meta,
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
): Pick<ChannelUpdate<T>, "channelAddress" | "nonce" | "fromIdentifier" | "toIdentifier" | "type"> {
  return {
    nonce: state.nonce + 1,
    channelAddress: state.channelAddress,
    type: params.type,
    fromIdentifier: signer.publicIdentifier,
    toIdentifier: signer.publicIdentifier === state.bobIdentifier ? state.aliceIdentifier : state.bobIdentifier,
  };
}

function getUpdatedChannelBalance(
  type: typeof UpdateType.create | typeof UpdateType.resolve,
  assetId: string,
  balanceToReconcile: Balance,
  state: FullChannelState,
  initiator: string,
): Balance {
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
  const assetIdx = assetIds.findIndex((a) => a === assetToReconcile);
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
  const assetIdx = assetIds.findIndex((a) => a === assetToReconcile);
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
