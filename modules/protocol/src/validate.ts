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
} from "@connext/vector-types";

import { applyUpdate } from "./update";
import { generateSignedChannelCommitment, validateChannelUpdateSignatures } from "./utils";

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
  counterpartyUpdate: ChannelUpdate<T>,
  previousState: FullChannelState | undefined,
  storeService: IVectorStore,
  chainReader: IVectorChainReader,
  externalValidation: IExternalValidation,
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

  if (previousState?.inDispute) {
    return returnError(ValidationError.reasons.InDispute);
  }

  const { channelAddress, details, type } = counterpartyUpdate;
  // Get the active transfers for the channel
  const activeTransfers = await storeService.getActiveTransfers(channelAddress);

  // Perform all common update validation -- see note above
  // calling function
  // Ensure the toIdentifier is ours

  // Ensure the fromIdentifier is the counterparties

  // Ensure the nonce == previousState.nonce + 1

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
      // Ensure the channelAddress is correctly generated

      // Ensure the timeout is reasonable

      // TODO: https://github.com/connext/vector/issues/51
      break;
    }

    case UpdateType.deposit: {
      // Ensure the balance has been correctly reconciled

      break;
    }
    case UpdateType.create: {
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
      const { transferId, transferResolver } = details as ResolveUpdateDetails;

      // Ensure transfer exists in store / retrieve for validation
      storedTransfer = await storeService.getTransferState(transferId);
      if (!storedTransfer) {
        return returnError(ValidationError.reasons.TransferNotFound);
      }

      // Ensure the transfer is active
      if (!activeTransfers.find(t => t.transferId === transferId)) {
        return returnError(ValidationError.reasons.TransferNotActive, previousState, {
          activeTransfers: activeTransfers.map(t => t.transferId).join(","),
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
  const externalRes = await externalValidation.validateInbound(counterpartyUpdate, previousState, storedTransfer);
  if (externalRes.isError) {
    return returnError(ValidationError.reasons.ExternalValidationFailed, previousState, {
      validationError: externalRes.getError()!.message,
    });
  }

  // Apply the update
  const applyRes = await applyUpdate(counterpartyUpdate, previousState, activeTransfers, finalTransferBalance);
  if (applyRes.isError) {
    // Returns an inbound channel error, so don't use helper to preserve
    // apply error
    return Result.fail(applyRes.getError()!);
  }
  return Result.ok(applyRes.getValue());
}
