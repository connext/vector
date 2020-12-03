import {
  UpdateType,
  ChannelUpdate,
  FullChannelState,
  Result,
  IChannelSigner,
  UpdateParams,
  OutboundChannelUpdateError,
  InboundChannelUpdateError,
  IVectorChainReader,
  Values,
  FullTransferState,
  ValidationError,
  CreateUpdateDetails,
  ResolveUpdateDetails,
  IExternalValidation,
  Balance,
  MINIMUM_CHANNEL_TIMEOUT,
  MINIMUM_TRANSFER_TIMEOUT,
  MAXIMUM_CHANNEL_TIMEOUT,
  MAXIMUM_TRANSFER_TIMEOUT,
  UpdateParamsMap,
  TSetupUpdateDetails,
  TDepositUpdateDetails,
  TCreateUpdateDetails,
  TResolveUpdateDetails,
  SetupUpdateDetails,
} from "@connext/vector-types";
import {
  getSignerAddressFromPublicIdentifier,
  getTransferId,
  hashTransferState,
  safeJsonStringify,
  generateMerkleTreeData,
} from "@connext/vector-utils";
import { isAddress } from "@ethersproject/address";
import { BigNumber } from "@ethersproject/bignumber";

import { applyUpdate } from "./update";
import {
  generateSignedChannelCommitment,
  getUpdatedChannelBalance,
  reconcileDeposit,
  validateChannelUpdateSignatures,
  validateSchema,
} from "./utils";

// This function performs all update *initiator* side validation
// and is called from within the `sync.outbound` function.
// It will return the valid previous state, as well as the valid parameters.
// NOTE: the presence and validity of the values within the parameters should
// be asserted before the operation is put under lock via schema definitions.
type OutboundValidationResult = Result<undefined, OutboundChannelUpdateError>;
export async function validateUpdateParams<T extends UpdateType = any>(
  signer: IChannelSigner,
  chainReader: IVectorChainReader,
  externalValidationService: IExternalValidation,
  params: UpdateParams<T>,
  previousState: FullChannelState | undefined, // Undefined IFF setup
  activeTransfers: FullTransferState[], // Defined IFF create/resolve
): Promise<OutboundValidationResult> {
  // Create a helper to handle errors properly
  const handleError = (
    validationError: Values<typeof ValidationError.reasons>,
    state: FullChannelState | undefined = previousState,
    context: any = {},
  ): OutboundValidationResult => {
    return Result.fail(
      new OutboundChannelUpdateError(validationError, params, state, {
        ...context,
      }),
    );
  };

  // Make sure previous state exists if not setup
  if (params.type !== UpdateType.setup && !previousState) {
    return handleError(ValidationError.reasons.ChannelNotFound);
  }

  // Make sure that if it is create or resolve, there are active transfers
  // provided to fn
  const isTransferUpdate = params.type === UpdateType.create || params.type === UpdateType.resolve;
  if (isTransferUpdate && !activeTransfers) {
    return handleError(ValidationError.reasons.NoActiveTransfers);
  }

  // TODO: add in resuming from dispute
  if (previousState?.inDispute ?? false) {
    return handleError(ValidationError.reasons.InDispute);
  }

  const { type, channelAddress, details } = params;

  switch (type) {
    case UpdateType.setup: {
      const { counterpartyIdentifier, timeout, networkContext } = details as UpdateParamsMap[typeof UpdateType.setup];
      // Should not have a previous state with that multisig
      if (previousState) {
        return handleError(ValidationError.reasons.ChannelAlreadySetup);
      }

      // Make sure the calculated channel address is the same as the one
      // derived from chain
      const calculated = await chainReader.getChannelAddress(
        signer.address,
        getSignerAddressFromPublicIdentifier(counterpartyIdentifier),
        networkContext.channelFactoryAddress,
        networkContext.chainId,
      );
      if (calculated.isError) {
        return handleError(calculated.getError()!.message);
      }
      if (channelAddress !== calculated.getValue()) {
        return handleError(ValidationError.reasons.InvalidChannelAddress);
      }

      // TODO: should we validate the transfer registry somehow? (i.e. fetching transfers)

      // Make sure the timeout is valid:
      // - should be above min (24hrs)
      // - should be below max (96hrs)
      const timeoutBN = BigNumber.from(timeout);
      if (timeoutBN.lt(MINIMUM_CHANNEL_TIMEOUT)) {
        return handleError(ValidationError.reasons.ShortChannelTimeout);
      }
      if (timeoutBN.gt(MAXIMUM_CHANNEL_TIMEOUT)) {
        return handleError(ValidationError.reasons.LongChannelTimeout);
      }

      // counterpartyIdentifier structure is already validated at
      // API level, so ensure this is not a channel with yourself
      if (counterpartyIdentifier === signer.publicIdentifier) {
        return handleError(ValidationError.reasons.InvalidCounterparty);
      }

      // TODO: ideally should only allow one channel per participant/chain set,
      // but currently there is no store-service passed into this function
      break;
    }

    case UpdateType.deposit: {
      const { assetId } = details as UpdateParamsMap[typeof UpdateType.deposit];

      if (!isAddress(assetId)) {
        return handleError(ValidationError.reasons.InvalidAssetId);
      }

      // Make sure that the array values all have the same length
      // TODO: is this the best place for this? (this *is* where new array
      // values would be added)
      const length = previousState!.assetIds.length;
      if (
        previousState!.defundNonces.length !== length ||
        previousState!.balances.length !== length ||
        previousState!.processedDepositsA.length !== length ||
        previousState!.processedDepositsB.length !== length
      ) {
        return handleError(ValidationError.reasons.InvalidArrayLength);
      }

      break;
    }

    case UpdateType.create: {
      const {
        balance,
        assetId,
        transferDefinition,
        transferInitialState,
        timeout,
      } = details as UpdateParamsMap[typeof UpdateType.create];

      // Make sure the active transfers array is present
      if (!activeTransfers) {
        return handleError(ValidationError.reasons.NoActiveTransfers);
      }

      // Verify the assetId is in the channel (and get index)
      const assetIdx = previousState!.assetIds.findIndex((a) => a === assetId);
      if (assetIdx < 0) {
        return handleError(ValidationError.reasons.AssetNotFound);
      }

      // Verify there is sufficient balance of the asset to create transfer
      const isAlice = signer.address === previousState!.alice;
      const signerBalance = BigNumber.from(previousState!.balances[assetIdx].amount[isAlice ? 0 : 1]);
      const counterpartyBalance = BigNumber.from(previousState!.balances[assetIdx].amount[isAlice ? 1 : 0]);
      if (signerBalance.lt(balance.amount[0]) || counterpartyBalance.lt(balance.amount[1])) {
        return handleError(ValidationError.reasons.InsufficientFunds);
      }

      // Verify timeout is valid:
      // - must be above min
      // - must be below max
      // - must be below channel timeout
      const timeoutBN = BigNumber.from(timeout);
      if (timeoutBN.gte(previousState!.timeout)) {
        return handleError(ValidationError.reasons.TransferTimeoutAboveChannel);
      }
      if (timeoutBN.lt(MINIMUM_TRANSFER_TIMEOUT)) {
        return handleError(ValidationError.reasons.TransferTimeoutBelowMin);
      }
      if (timeoutBN.gt(MAXIMUM_TRANSFER_TIMEOUT)) {
        return handleError(ValidationError.reasons.TransferTimeoutAboveMax);
      }

      // Verify initial state is valid onchain
      const validRes = await chainReader.create(
        transferInitialState,
        balance,
        transferDefinition,
        previousState!.networkContext.transferRegistryAddress,
        previousState!.networkContext.chainId,
      );
      if (validRes.isError) {
        return handleError(validRes.getError()!.message);
      }
      if (!validRes.getValue()) {
        return handleError(ValidationError.reasons.InvalidInitialState);
      }

      break;
    }

    case UpdateType.resolve: {
      const { transferId, transferResolver } = details as UpdateParamsMap[typeof UpdateType.resolve];

      // Make sure the active transfers array is present
      if (!activeTransfers) {
        return handleError(ValidationError.reasons.NoActiveTransfers);
      }

      // Make sure the transfer is active
      const transfer = activeTransfers.find((t) => t.transferId === transferId);
      if (!transfer) {
        return handleError(ValidationError.reasons.TransferNotActive);
      }

      // Make sure transfer resolver is an object
      if (typeof transferResolver !== "object") {
        return handleError(ValidationError.reasons.InvalidResolver);
      }

      break;
    }

    default: {
      return handleError(ValidationError.reasons.UnrecognizedType);
    }
  }

  // Perform external validation
  const externalRes = await externalValidationService.validateOutbound(params, previousState, activeTransfers);
  if (externalRes.isError) {
    return handleError(externalRes.getError()!.message);
  }

  return Result.ok(undefined);
}

// This function performs all update validation when you are receiving
// a proposed update in `sync.inbound` and `sync.outbound` when you
// are behind and have proposed an update. It will validate + apply the
// update, returning the signed commitment and updated values

// NOTE: NONE of the parameters here should be assumed valid, since
// this information is passed over the wire and is not validated
// using the defined schemas. Additionally, this function is called
// by `sync.inbound` (primarily), which is registered on a messaging
// callback.
export async function validateAndApplyInboundUpdate<T extends UpdateType = any>(
  chainReader: IVectorChainReader,
  externalValidation: IExternalValidation,
  signer: IChannelSigner,
  update: ChannelUpdate<T>,
  previousState: FullChannelState | undefined,
  activeTransfers: FullTransferState[],
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
  // Apply update and validate signatures before validating the actual update.
  // By doing it in this order, we can exit early if both signatures on the
  // update are present and valid

  // Apply the proposed update
  let finalTransferBalance: Balance | undefined = undefined;
  if (update.type === UpdateType.resolve) {
    // Resolve updates require the final transfer balance from the chainReader
    const transfer = (activeTransfers ?? []).find(
      (t) => t.transferId === (update.details as ResolveUpdateDetails).transferId ?? "",
    );
    const transferBalanceResult = await chainReader.resolve(
      { ...transfer!, transferResolver: (update.details as ResolveUpdateDetails).transferResolver },
      previousState!.networkContext.chainId,
    );

    if (transferBalanceResult.isError) {
      return Result.fail(
        new InboundChannelUpdateError(transferBalanceResult.getError()!.message as any, update, previousState),
      );
    }
    finalTransferBalance = transferBalanceResult.getValue();
  }

  const applyRes = await applyUpdate(update, previousState, activeTransfers, finalTransferBalance);
  if (applyRes.isError) {
    return Result.fail(applyRes.getError()!);
  }

  const { updatedChannel, updatedTransfer, updatedActiveTransfers } = applyRes.getValue();

  // Check the signatures
  const doubleSigned = update.aliceSignature && update.bobSignature;
  const sigRes = await validateChannelUpdateSignatures(
    updatedChannel,
    update.aliceSignature,
    update.bobSignature,
    doubleSigned ? "both" : signer.address === updatedChannel.bob ? "alice" : "bob",
  );
  if (sigRes.isError) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.BadSignatures, update, updatedChannel, {
        error: sigRes.getError().message,
      }),
    );
  }

  // If the update is double signed, return without further validation
  if (doubleSigned) {
    return Result.ok({
      updatedChannel: {
        ...updatedChannel,
        latestUpdate: {
          ...updatedChannel.latestUpdate,
          aliceSignature: update.aliceSignature,
          bobSignature: update.bobSignature,
        },
      },
      updatedActiveTransfers,
      updatedTransfer,
    });
  }

  // Validate the update before adding signature
  const res = await validateAndApplyChannelUpdate(
    signer,
    chainReader,
    externalValidation,
    update,
    previousState,
    activeTransfers,
  );
  if (res.isError) {
    return Result.fail(res.getError()!);
  }

  // Generate the cosigned commitment
  const signedRes = await generateSignedChannelCommitment(
    updatedChannel,
    signer,
    update.aliceSignature,
    update.bobSignature,
  );
  if (signedRes.isError) {
    return Result.fail(new InboundChannelUpdateError(signedRes.getError()?.message as any, update, updatedChannel));
  }
  const signed = signedRes.getValue();

  // Add the signature to the state
  const signedNextState = {
    ...updatedChannel,
    latestUpdate: {
      ...updatedChannel.latestUpdate,
      aliceSignature: signed.aliceSignature,
      bobSignature: signed.bobSignature,
    },
  };

  // Return the validated update, resultant state, double signed
  // commitment, and the transfer data
  return Result.ok({ updatedChannel: signedNextState, updatedActiveTransfers, updatedTransfer });
}

// This function will take in a requested update from the counterparty,
// validate it, and apply it.
type InboundValidationResult = Result<void, InboundChannelUpdateError>;
async function validateAndApplyChannelUpdate<T extends UpdateType>(
  signer: IChannelSigner,
  chainReader: IVectorChainReader,
  externalValidation: IExternalValidation,
  proposedUpdate: ChannelUpdate<T>,
  previousState: FullChannelState | undefined,
  activeTransfers: FullTransferState[],
): Promise<InboundValidationResult> {
  // Create a helper to handle errors properly
  const returnError = (
    validationError: Values<typeof ValidationError.reasons>,
    state: FullChannelState | undefined = previousState,
    context: any = {},
  ): InboundValidationResult => {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.InboundValidationFailed, proposedUpdate, state, {
        error: validationError,
        ...context,
      }),
    );
  };

  // Must have previous state if not setup
  if (!previousState && proposedUpdate.type !== UpdateType.setup) {
    return returnError(InboundChannelUpdateError.reasons.ChannelNotFound);
  }

  // TODO: dispute recovery
  if (previousState && previousState.inDispute) {
    return returnError(ValidationError.reasons.InDispute);
  }

  const isAlice = signer.publicIdentifier === previousState?.aliceIdentifier;

  const { channelAddress, details, type, fromIdentifier, toIdentifier, nonce, balance, assetId } = proposedUpdate;

  // Ensure the toIdentifier is ours
  if (signer.publicIdentifier !== toIdentifier) {
    return returnError(ValidationError.reasons.InvalidToIdentifier);
  }

  if (fromIdentifier === signer.publicIdentifier) {
    return returnError(ValidationError.reasons.InvalidCounterparty);
  }

  // Ensure the fromIdentifier is the counterparties
  if (previousState && fromIdentifier !== previousState[isAlice ? "bobIdentifier" : "aliceIdentifier"]) {
    return returnError(ValidationError.reasons.InvalidToIdentifier);
  }

  // Ensure the nonce == previousState.nonce + 1
  const stateNonce = previousState?.nonce ?? 0;
  if (nonce !== stateNonce + 1) {
    return returnError(ValidationError.reasons.InvalidUpdateNonce);
  }

  // Signature verification done after update applied in calling function

  // Perform update-type specific validation

  switch (type) {
    case UpdateType.setup: {
      // Verify details are properly structured
      const invalid = validateSchema(details, TSetupUpdateDetails);
      if (invalid) {
        return returnError(ValidationError.reasons.MalformedDetails, previousState, { invalid });
      }

      const { networkContext, timeout } = details as SetupUpdateDetails;

      // Should not have a previous state with that multisig
      if (previousState) {
        return returnError(ValidationError.reasons.ChannelAlreadySetup);
      }

      // Ensure the channelAddress is correctly generated
      const calculated = await chainReader.getChannelAddress(
        getSignerAddressFromPublicIdentifier(fromIdentifier),
        signer.address,
        networkContext.channelFactoryAddress,
        networkContext.chainId,
      );
      if (calculated.isError) {
        return returnError(calculated.getError()!.message);
      }
      if (channelAddress !== calculated.getValue()) {
        return returnError(ValidationError.reasons.InvalidChannelAddress);
      }

      // Make sure the timeout is valid:
      // - should be above min (24hrs)
      // - should be below max (96hrs)
      const timeoutBN = BigNumber.from(timeout);
      if (timeoutBN.lt(MINIMUM_CHANNEL_TIMEOUT)) {
        return returnError(ValidationError.reasons.ShortChannelTimeout);
      }
      if (timeoutBN.gt(MAXIMUM_CHANNEL_TIMEOUT)) {
        return returnError(ValidationError.reasons.LongChannelTimeout);
      }

      break;
    }

    case UpdateType.deposit: {
      // Verify details are properly structured
      const invalid = validateSchema(details, TDepositUpdateDetails);
      if (invalid) {
        return returnError(ValidationError.reasons.MalformedDetails, previousState, { invalid });
      }

      // Make sure that the array values all have the same length
      // TODO: is this the best place for this? (this *is* where new array
      // values would be added)
      const length = previousState!.assetIds.length;
      if (
        previousState!.defundNonces.length !== length ||
        previousState!.balances.length !== length ||
        previousState!.processedDepositsA.length !== length ||
        previousState!.processedDepositsB.length !== length
      ) {
        return returnError(ValidationError.reasons.InvalidArrayLength);
      }

      // Ensure the balance has been correctly reconciled
      const idx = previousState!.assetIds.includes(assetId)
        ? previousState!.assetIds.findIndex((a) => a === assetId)
        : previousState!.assetIds.length;

      const reconcileRes = await reconcileDeposit(
        channelAddress,
        previousState!.networkContext.chainId,
        previousState!.balances[idx] ?? { to: [previousState!.alice, previousState!.bob], amount: ["0", "0"] },
        previousState!.processedDepositsA[idx] ?? "0",
        previousState!.processedDepositsB[idx] ?? "0",
        assetId,
        chainReader,
      );

      if (reconcileRes.isError) {
        return returnError(reconcileRes.getError()!.message);
      }

      if (safeJsonStringify({ balance, ...details }) !== safeJsonStringify(reconcileRes.getValue())) {
        return returnError(ValidationError.reasons.ImproperlyReconciled);
      }
      break;
    }

    case UpdateType.create: {
      // Verify details are properly structured
      const invalid = validateSchema(details, TCreateUpdateDetails);
      if (invalid) {
        return returnError(ValidationError.reasons.MalformedDetails, previousState, { invalid });
      }
      const {
        transferId,
        balance: transferBalance,
        transferDefinition,
        transferTimeout,
        transferInitialState,
        transferEncodings,
        merkleProofData,
        merkleRoot,
        meta,
      } = details as CreateUpdateDetails;

      // Should not have transfer
      if (activeTransfers.find((t) => t.transferId === transferId)) {
        return returnError(ValidationError.reasons.DuplicateTransferId, previousState, {
          existing: activeTransfers.map((t) => t.transferId),
        });
      }

      // Get the registry info
      const registryInfo = await chainReader.getRegisteredTransferByDefinition(
        transferDefinition,
        previousState!.networkContext.transferRegistryAddress,
        previousState!.networkContext!.chainId,
      );
      if (registryInfo.isError) {
        return returnError(registryInfo.getError()!.message);
      }

      // Ensure correct encodings
      const { stateEncoding, resolverEncoding } = registryInfo.getValue();
      if (stateEncoding !== transferEncodings[0] || resolverEncoding !== transferEncodings[1]) {
        return returnError(ValidationError.reasons.InvalidTransferEncodings, previousState, {
          transferEncodings,
          stateEncoding,
          resolverEncoding,
        });
      }

      // Ensure the transferId is properly calculated
      const calculated = getTransferId(
        previousState!.channelAddress,
        previousState!.nonce.toString(),
        transferDefinition,
        transferTimeout,
      );
      if (calculated !== transferId) {
        return returnError(ValidationError.reasons.MiscalculatedTransferId, previousState, { transferId, calculated });
      }

      // Verify timeout is valid:
      // - must be above min
      // - must be below max
      // - must be below channel timeout
      const timeoutBN = BigNumber.from(transferTimeout);
      if (timeoutBN.gte(previousState!.timeout)) {
        return returnError(ValidationError.reasons.TransferTimeoutAboveChannel);
      }
      if (timeoutBN.lt(MINIMUM_TRANSFER_TIMEOUT)) {
        return returnError(ValidationError.reasons.TransferTimeoutBelowMin);
      }
      if (timeoutBN.gt(MAXIMUM_TRANSFER_TIMEOUT)) {
        return returnError(ValidationError.reasons.TransferTimeoutAboveMax);
      }

      // Verify initial state is valid onchain
      const validRes = await chainReader.create(
        transferInitialState,
        transferBalance,
        transferDefinition,
        previousState!.networkContext.transferRegistryAddress,
        previousState!.networkContext.chainId,
      );
      if (validRes.isError) {
        return returnError(validRes.getError()!.message);
      }
      if (!validRes.getValue()) {
        return returnError(ValidationError.reasons.InvalidInitialState);
      }

      // Verify the assetId is in the channel (and get index)
      const assetIdx = previousState!.assetIds.findIndex((a) => a === assetId);
      if (assetIdx < 0) {
        return returnError(ValidationError.reasons.AssetNotFound);
      }

      // Verify there is sufficient balance of the asset to create transfer
      const isAlice = signer.address === previousState!.alice;
      const signerBalance = BigNumber.from(previousState!.balances[assetIdx].amount[isAlice ? 0 : 1]);
      const counterpartyBalance = BigNumber.from(previousState!.balances[assetIdx].amount[isAlice ? 1 : 0]);
      if (signerBalance.lt(balance.amount[1]) || counterpartyBalance.lt(balance.amount[0])) {
        return returnError(ValidationError.reasons.InsufficientFunds);
      }

      // Verify the update balance is correct
      const calculatedBalance = getUpdatedChannelBalance(
        UpdateType.create,
        assetId,
        transferBalance,
        previousState!,
        getSignerAddressFromPublicIdentifier(fromIdentifier),
      );
      if (safeJsonStringify(calculatedBalance) !== safeJsonStringify(balance)) {
        return returnError(ValidationError.reasons.MiscalculatedChannelBalance);
      }

      // Update the active transfers
      const newTransfer: FullTransferState = {
        balance: transferBalance,
        assetId,
        transferId,
        channelAddress,
        transferDefinition,
        transferEncodings,
        transferTimeout,
        initialStateHash: hashTransferState(transferInitialState, stateEncoding),
        transferState: transferInitialState,
        channelFactoryAddress: previousState!.networkContext.channelFactoryAddress,
        chainId: previousState!.networkContext.chainId,
        transferResolver: undefined,
        initiator: signer.address === previousState!.alice ? previousState!.bob : previousState!.alice,
        responder: signer.address,
        meta,
        inDispute: false,
      };

      // Recreate the merkle tree
      const { proof, root } = generateMerkleTreeData([...activeTransfers!, newTransfer], newTransfer);

      // Ensure the merkleProofData is correct
      if (proof!.join(",") !== merkleProofData.join(",")) {
        return returnError(ValidationError.reasons.MiscalculatedMerkleProof, previousState, {
          existing: activeTransfers!.map((t) => t.transferId),
          transferId,
        });
      }

      // Ensure the same merkleRoot is generated
      if (merkleRoot !== root) {
        return returnError(ValidationError.reasons.MiscalculatedMerkleRoot, previousState, {
          existing: activeTransfers!.map((t) => t.transferId),
          transferId,
        });
      }
      break;
    }

    case UpdateType.resolve: {
      // Verify details are properly structured
      const invalid = validateSchema(details, TResolveUpdateDetails);
      if (invalid) {
        return returnError(ValidationError.reasons.MalformedDetails, previousState, { invalid });
      }
      const { transferId, transferResolver, transferDefinition, merkleRoot } = details as ResolveUpdateDetails;

      // Ensure transfer exists in store / retrieve for validation
      const transfer = activeTransfers.find((t) => t.transferId === transferId);
      if (!transfer) {
        return returnError(ValidationError.reasons.TransferNotFound);
      }

      // Ensure transfer definition is correct
      if (transferDefinition !== transfer.transferDefinition) {
        return returnError(ValidationError.reasons.InvalidTransferDefinition, previousState, {
          transferDefinition,
          storedTransferDefinition: transfer.transferDefinition,
          transferId,
        });
      }

      // Ensure update.assetId == transfer.assetId
      if (assetId !== transfer.assetId) {
        return returnError(ValidationError.reasons.InvalidAssetId, previousState, {
          assetId,
          stored: transfer.assetId,
        });
      }

      // Ensure the transfer is active
      const transferIdx = activeTransfers!.findIndex((t) => t.transferId === transferId);
      if (transferIdx < 0) {
        return returnError(ValidationError.reasons.TransferNotActive, previousState, {
          activeTransfers: activeTransfers!.map((t) => t.transferId).join(","),
        });
      }

      // Recreate the merkle tree + verify root
      const { root } = generateMerkleTreeData(activeTransfers!.filter((x) => x.transferId !== transferId));

      if (merkleRoot !== root) {
        return returnError(ValidationError.reasons.MiscalculatedMerkleRoot, previousState, {
          active: activeTransfers!.map((t) => t.transferId),
        });
      }

      break;
    }
    default: {
      return returnError(ValidationError.reasons.BadUpdateType);
    }
  }

  // All default validation is performed, now perform external validation
  const externalRes = await externalValidation.validateInbound(proposedUpdate, previousState, activeTransfers);
  if (externalRes.isError) {
    return returnError(ValidationError.reasons.ExternalValidationFailed, previousState, {
      validationError: externalRes.getError()!.message,
    });
  }

  return Result.ok(undefined);
}
