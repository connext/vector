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
  TSetupUpdateDetails,
  TDepositUpdateDetails,
  TCreateUpdateDetails,
  TResolveUpdateDetails,
} from "@connext/vector-types";

import { applyUpdate } from "./update";
import { generateSignedChannelCommitment, validateChannelUpdateSignatures, validateSchema } from "./utils";

// This function performs all update *initiator* side validation
// and is called from within the `sync.outbound` function.
// It will return the valid previous state, as well as the valid parameters.
// NOTE: the presence and validity of the values within the parameters should
// be asserted before the operation is put under lock via schema definitions.
export async function validateUpdateParams<T extends UpdateType = any>(
  signer: IChannelSigner,
  externalValidationService: IExternalValidation,
  params: UpdateParams<T>,
  previousState: FullChannelState | undefined, // Undefined IFF setup
  activeTransfers: FullTransferState[] | undefined, // Defined IFF create/resolve
  transfer: FullTransferState | undefined, // Defined IFF resolve
): Promise<Result<undefined, OutboundChannelUpdateError>> {
  // TODO: implement validation
  return Promise.resolve(Result.ok(undefined));
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
  activeTransfers: FullTransferState[] | undefined,
  transfer: FullTransferState | undefined,
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
    chainReader,
    externalValidation,
    update,
    previousState,
    activeTransfers,
    transfer,
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
  chainReader: IVectorChainReader,
  externalValidation: IExternalValidation,
  counterpartyUpdate: ChannelUpdate<T>,
  previousState: FullChannelState | undefined,
  activeTransfers: FullTransferState[] | undefined,
  transfer: FullTransferState | undefined,
): Promise<InboundValidationResult> {
  // Create a helper to handle errors properly
  const returnError = (
    validationError: Values<typeof ValidationError.reasons>,
    state: FullChannelState | undefined = previousState,
    context: any = {},
  ): InboundValidationResult => {
    return Result.fail(
      new InboundChannelUpdateError(
        InboundChannelUpdateError.reasons.InboundValidationFailed,
        counterpartyUpdate,
        state,
        {
          error: validationError,
          ...context,
        },
      ),
    );
  };

  if (!previousState && counterpartyUpdate.type !== UpdateType.setup) {
    returnError(InboundChannelUpdateError.reasons.ChannelNotFound);
  }

  if (previousState && previousState.inDispute) {
    return returnError(ValidationError.reasons.InDispute);
  }

  const { channelAddress, details, type } = counterpartyUpdate;

  // Perform all common update validation -- see note above
  // calling function
  // Ensure the toIdentifier is ours

  // Ensure the fromIdentifier is the counterparties

  // Ensure the nonce == previousState.nonce + 1

  // Ensure the assetId is valid

  // Perform update-type specific validation

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
      if (!transfer) {
        return returnError(ValidationError.reasons.TransferNotFound);
      }

      // Ensure the transfer is active
      if (!activeTransfers!.find((t) => t.transferId === transferId)) {
        return returnError(ValidationError.reasons.TransferNotActive, previousState, {
          activeTransfers: activeTransfers!.map((t) => t.transferId).join(","),
        });
      }

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
  const externalRes = await externalValidation.validateInbound(counterpartyUpdate, previousState, transfer);
  if (externalRes.isError) {
    return returnError(ValidationError.reasons.ExternalValidationFailed, previousState, {
      validationError: externalRes.getError()!.message,
    });
  }

  return Result.ok(undefined);
}
