import {
  UpdateType,
  ChannelUpdate,
  FullChannelState,
  IVectorStore,
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
} from "@connext/vector-types";
import { isAddress } from "@ethersproject/address";
import { BigNumber } from "@ethersproject/bignumber";

import { applyUpdate } from "./update";
import { generateSignedChannelCommitment, validateChannelUpdateSignatures, validateSchema } from "./utils";

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
  activeTransfers: FullTransferState[] | undefined, // Defined IFF create/resolve
  transfer: FullTransferState | undefined, // Defined IFF resolve
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

  // Make sure transfer is provided if resolving
  if (params.type === UpdateType.resolve && !transfer) {
    return handleError(ValidationError.reasons.TransferNotFound);
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
        signer.publicIdentifier,
        counterpartyIdentifier,
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
      const channelBalance = BigNumber.from(previousState!.balances[assetIdx].amount[isAlice ? 0 : 1]);
      if (channelBalance.lt(balance.amount[0])) {
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

      // Make sure the transfer is present
      if (!transfer || transfer.transferId !== transferId) {
        return handleError(ValidationError.reasons.TransferNotFound);
      }

      // Make sure the transfer is active
      if (activeTransfers.findIndex((t) => t.transferId === transferId) < 0) {
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
  const externalRes = await externalValidationService.validateOutbound(params, previousState, transfer);
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
  update: ChannelUpdate<T>,
  previousState: FullChannelState | undefined,
  storeService: IVectorStore,
  chainReader: IVectorChainReader,
  externalValidation: IExternalValidation,
  signer: IChannelSigner,
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
  // Validate + apply the update
  const res = await validateAndApplyChannelUpdate(update, previousState, storeService, chainReader, externalValidation);
  if (res.isError) {
    return Result.fail(res.getError()!);
  }

  const { updatedChannel, updatedTransfer, updatedActiveTransfers } = res.getValue();

  // Verify at least one signature exists (and any present are valid)
  const sigRes = await validateChannelUpdateSignatures(
    updatedChannel,
    update.aliceSignature,
    update.bobSignature,
    signer.address === updatedChannel.bob ? "alice" : "bob",
  );
  if (sigRes.isError) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.BadSignatures, update, updatedChannel, {
        error: sigRes.getError().message,
      }),
    );
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
type InboundValidationResult = Result<
  {
    updatedChannel: FullChannelState;
    updatedActiveTransfers?: FullTransferState[];
    updatedTransfer?: FullTransferState;
  },
  InboundChannelUpdateError
>;
async function validateAndApplyChannelUpdate<T extends UpdateType>(
  proposedUpdate: ChannelUpdate<T>,
  previousState: FullChannelState | undefined,
  storeService: IVectorStore,
  chainReader: IVectorChainReader,
  externalValidation: IExternalValidation,
  signer: IChannelSigner,
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

  if (!previousState && proposedUpdate.type !== UpdateType.setup) {
    return returnError(InboundChannelUpdateError.reasons.ChannelNotFound);
  }

  if (previousState && previousState.inDispute) {
    return returnError(ValidationError.reasons.InDispute);
  }

  // If the previous state is undefined here, it must be a setup update. This
  // means the person performing the inbound validation will always be bob in
  // the channel
  const isAlice = signer.publicIdentifier === previousState?.aliceIdentifier;

  const {
    channelAddress,
    details,
    type,
    fromIdentifier,
    toIdentifier,
    nonce,
    balance,
    assetId,
    aliceSignature,
    bobSignature,
  } = proposedUpdate;

  // Get the active transfers for the channel
  // TODO: change API of this function to extract values from store properly
  // in the sync function where the previous state is pulled
  let activeTransfers: FullTransferState[];
  try {
    activeTransfers = await storeService.getActiveTransfers(channelAddress);
  } catch (e) {
    return returnError(ValidationError.reasons.StoreFailure, previousState, {
      error: e.message,
      storeMethod: "getActiveTransfers",
    });
  }

  // Perform all common update validation -- see note above
  // calling function
  // Ensure the toIdentifier is ours
  if (signer.publicIdentifier !== toIdentifier) {
    return returnError(ValidationError.reasons.InvalidToIdentifier);
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

  // Ensure the assetId is valid

  // Perform update-type specific validation

  // You will need the final transfer balance when applying the
  // resolve update. See note in `applyUpdate`.
  let finalTransferBalance: Balance | undefined = undefined;
  // You will also need access to the stored transfer for any
  // external validation when resolving
  let storedTransfer: FullTransferState | undefined = undefined;
  switch (type) {
    case UpdateType.setup: {
      // Verify details are properly structured
      const invalid = validateSchema(details, TSetupUpdateDetails);
      if (invalid) {
        return returnError(ValidationError.reasons.MalformedDetails, previousState, { invalid });
      }

      // Ensure the channelAddress is correctly generated

      // Ensure the timeout is reasonable

      // TODO: https://github.com/connext/vector/issues/51
      break;
    }

    case UpdateType.deposit: {
      // Verify details are properly structured
      const invalid = validateSchema(details, TDepositUpdateDetails);
      if (invalid) {
        return returnError(ValidationError.reasons.MalformedDetails, previousState, { invalid });
      }
      // Ensure the balance has been correctly reconciled

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
        transferDefinition,
        transferTimeout,
        transferInitialState,
        transferEncodings,
        meta,
      } = details as CreateUpdateDetails;
      // Ensure the transferId is properly formatted

      // Ensure the transferDefinition is properly formatted

      // If present, ensure the meta is an object

      // Ensure the transferTimeout is above the minimum

      // Ensure the transferInitialState is correctly structured

      // Ensure there is sufficient balance in the channel for the
      // proposed transfer for the appropriate asset

      // Ensure the transferEncoding is correct for the state
      // TODO: https://github.com/connext/vector/issues/51

      // Update the active transfers

      // Recreate the merkle tree

      // Ensure the merkleProofData is correct

      // Ensure the same merkleRoot is generated
      break;
    }
    case UpdateType.resolve: {
      // Verify details are properly structured
      const invalid = validateSchema(details, TResolveUpdateDetails);
      if (invalid) {
        return returnError(ValidationError.reasons.MalformedDetails, previousState, { invalid });
      }
      const { transferId, transferResolver } = details as ResolveUpdateDetails;

      // Ensure transfer exists in store / retrieve for validation
      storedTransfer = await storeService.getTransferState(transferId);
      if (!storedTransfer) {
        return returnError(ValidationError.reasons.TransferNotFound);
      }

      // Ensure the transfer is active
      if (!activeTransfers.find((t) => t.transferId === transferId)) {
        return returnError(ValidationError.reasons.TransferNotActive, previousState, {
          activeTransfers: activeTransfers.map((t) => t.transferId).join(","),
        });
      }

      // Get the final transfer balance from contract
      const transferBalanceResult = await chainReader.resolve(
        { ...storedTransfer, transferResolver },
        previousState!.networkContext.chainId,
      );

      if (transferBalanceResult.isError) {
        throw transferBalanceResult.getError()!;
      }
      finalTransferBalance = transferBalanceResult.getValue()!;

      // Ensure the transfer exists within the active transfers

      // Ensure the initiators transfer information is the same as ours:
      // - transferDefintion
      // - transferEncodings

      // Verify the balance is the same from update initiator
      // and chain service

      // Regenerate the merkle tree

      // Verify the merkle root is correct

      // If exists, verify the meta is an object
      break;
    }
    default: {
      return returnError(ValidationError.reasons.BadUpdateType);
    }
  }

  // All default validation is performed, now perform external validation
  const externalRes = await externalValidation.validateInbound(proposedUpdate, previousState, storedTransfer);
  if (externalRes.isError) {
    return returnError(ValidationError.reasons.ExternalValidationFailed, previousState, {
      validationError: externalRes.getError()!.message,
    });
  }

  // Apply the update
  const applyRes = await applyUpdate(proposedUpdate, previousState, activeTransfers, finalTransferBalance);
  if (applyRes.isError) {
    // Returns an inbound channel error, so don't use helper to preserve
    // apply error
    return Result.fail(applyRes.getError()!);
  }
  return Result.ok(applyRes.getValue());
}
