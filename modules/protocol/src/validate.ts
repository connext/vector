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
  ResolveUpdateDetails,
  IExternalValidation,
  Balance,
  MINIMUM_CHANNEL_TIMEOUT,
  MINIMUM_TRANSFER_TIMEOUT,
  MAXIMUM_CHANNEL_TIMEOUT,
  MAXIMUM_TRANSFER_TIMEOUT,
  UpdateParamsMap,
  TChannelUpdate,
  TCreateUpdateDetails,
  TSetupUpdateDetails,
  TDepositUpdateDetails,
  TResolveUpdateDetails,
} from "@connext/vector-types";
import { getSignerAddressFromPublicIdentifier, getTransferId } from "@connext/vector-utils";
import { isAddress } from "@ethersproject/address";
import { BigNumber } from "@ethersproject/bignumber";

import { applyUpdate, generateAndApplyUpdate } from "./update";
import {
  generateSignedChannelCommitment,
  getParamsFromUpdate,
  validateChannelUpdateSignatures,
  validateSchema,
} from "./utils";

// This function performs all update *initiator* side validation
// and is called from within the `sync.outbound` function.
// It will return the valid previous state, as well as the valid parameters.
// NOTE: the presence and validity of the values within the parameters should
// be asserted before this function is valled using schema defs
export async function validateUpdateParams<T extends UpdateType = any>(
  signer: IChannelSigner,
  chainReader: IVectorChainReader,
  externalValidationService: IExternalValidation,
  params: UpdateParams<T>,
  previousState: FullChannelState | undefined, // Undefined IFF setup
  activeTransfers: FullTransferState[], // Defined IFF create/resolve
  initiatorIdentifier: string,
): Promise<Result<undefined, ValidationError>> {
  // Create a helper to handle errors properly
  const handleError = (
    validationError: Values<typeof ValidationError.reasons>,
    state: FullChannelState | undefined = previousState,
    context: any = {},
  ): Result<undefined, ValidationError> => {
    return Result.fail(new ValidationError(validationError, params, state, context));
  };

  // Make sure previous state exists if not setup
  if (params.type !== UpdateType.setup && !previousState) {
    return handleError(ValidationError.reasons.ChannelNotFound);
  }

  // TODO: add in resuming from dispute
  if (previousState?.inDispute ?? false) {
    return handleError(ValidationError.reasons.InDispute);
  }

  const { type, channelAddress, details } = params;

  if (previousState && channelAddress !== previousState.channelAddress) {
    return handleError(ValidationError.reasons.InvalidChannelAddress);
  }

  const length = (previousState?.assetIds ?? []).length;
  if (
    (previousState?.defundNonces ?? []).length !== length ||
    (previousState?.balances ?? []).length !== length ||
    (previousState?.processedDepositsA ?? []).length !== length ||
    (previousState?.processedDepositsB ?? []).length !== length
  ) {
    return handleError(ValidationError.reasons.InvalidArrayLength);
  }

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
        getSignerAddressFromPublicIdentifier(initiatorIdentifier),
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
      if (counterpartyIdentifier === initiatorIdentifier) {
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

      // Verify the assetId is in the channel (and get index)
      const assetIdx = previousState!.assetIds.findIndex((a) => a === assetId);
      if (assetIdx < 0) {
        return handleError(ValidationError.reasons.AssetNotFound);
      }

      // NOTE: verifying that a transfer is not active is done in `generateUpdate`
      const transferId = getTransferId(
        previousState!.channelAddress,
        previousState!.nonce.toString(),
        transferDefinition,
        timeout,
      );
      if (activeTransfers.find((t) => t.transferId === transferId)) {
        return handleError(ValidationError.reasons.DuplicateTransferId);
      }

      // Verify there is sufficient balance of the asset to create transfer
      const isAlice = signer.address === previousState!.alice;
      const signerChannelBalance = BigNumber.from(previousState!.balances[assetIdx].amount[isAlice ? 0 : 1]);
      const counterpartyChannelBalance = BigNumber.from(previousState!.balances[assetIdx].amount[isAlice ? 1 : 0]);
      const signerCreated = signer.publicIdentifier === initiatorIdentifier;
      if (
        signerChannelBalance.lt(balance.amount[signerCreated ? 0 : 1]) ||
        counterpartyChannelBalance.lt(balance.amount[signerCreated ? 1 : 0])
      ) {
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

      // Make sure the transfer is active
      const transfer = activeTransfers.find((t) => t.transferId === transferId);
      if (!transfer) {
        return handleError(ValidationError.reasons.TransferNotActive);
      }

      // Make sure transfer resolver is an object
      if (typeof transferResolver !== "object") {
        return handleError(ValidationError.reasons.InvalidResolver);
      }

      // Should fail if initiator is not transfer responder
      if (getSignerAddressFromPublicIdentifier(initiatorIdentifier) !== transfer.responder) {
        return handleError(ValidationError.reasons.OnlyResponderCanInitiateResolve);
      }

      // Should fail if transfer has resolver
      if (transfer.transferResolver) {
        return handleError(ValidationError.reasons.TransferResolved);
      }

      break;
    }

    default: {
      return handleError(ValidationError.reasons.UnrecognizedType);
    }
  }

  // Perform external validation iff you are update sender
  if (initiatorIdentifier === signer.publicIdentifier) {
    const externalRes = await externalValidationService.validateOutbound(params, previousState, activeTransfers);
    if (externalRes.isError) {
      return handleError(ValidationError.reasons.ExternalValidationFailed, previousState, {
        error: externalRes.getError()!.message,
      });
    }
  }

  return Result.ok(undefined);
}

export const validateParamsAndApplyUpdate = async (
  signer: IChannelSigner,
  chainReader: IVectorChainReader,
  externalValidation: IExternalValidation,
  params: UpdateParams<any>,
  previousState: FullChannelState | undefined,
  activeTransfers: FullTransferState[],
  initiatorIdentifier: string,
): Promise<
  Result<
    {
      update: ChannelUpdate;
      updatedChannel: FullChannelState;
      updatedActiveTransfers: FullTransferState[] | undefined;
      updatedTransfer: FullTransferState | undefined;
    },
    OutboundChannelUpdateError
  >
> => {
  // Verify params are valid
  const validParamsRes = await validateUpdateParams(
    signer,
    chainReader,
    externalValidation,
    params,
    previousState,
    activeTransfers,
    initiatorIdentifier,
  );
  if (validParamsRes.isError) {
    return Result.fail(
      new OutboundChannelUpdateError(
        OutboundChannelUpdateError.reasons.OutboundValidationFailed,
        params,
        previousState,
        {
          error: validParamsRes.getError()!.message,
        },
      ),
    );
  }

  // Generate the update from the user supplied parameters, returning
  // any fields that may be updated during this generation
  const updateRes = await generateAndApplyUpdate(
    signer,
    chainReader,
    params,
    previousState,
    activeTransfers,
    initiatorIdentifier,
  );
  return updateRes;
};

// This function performs all update validation when you are receiving
// a proposed update in `sync.inbound` and `sync.outbound` when you
// are behind and have proposed an update. It will validate + apply the
// update, returning the signed commitment and updated values
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
  // Make sure update + details have proper structure before proceeding
  const invalidUpdate = validateSchema(update, TChannelUpdate);
  if (invalidUpdate) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.MalformedUpdate, update, previousState, {
        error: invalidUpdate,
      }),
    );
  }
  const schemas = {
    [UpdateType.create]: TCreateUpdateDetails,
    [UpdateType.setup]: TSetupUpdateDetails,
    [UpdateType.deposit]: TDepositUpdateDetails,
    [UpdateType.resolve]: TResolveUpdateDetails,
  };
  const invalid = validateSchema(update.details, schemas[update.type]);
  if (invalid) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.MalformedDetails, update, previousState, {
        error: invalid,
      }),
    );
  }

  // Shortcut: check if the incoming update is double signed. If it is, and the
  // nonce, only increments by 1, then it is safe to apply update and proceed
  // without any additional validation.
  const expected = (previousState?.nonce ?? 0) + 1;
  if (update.nonce !== expected) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.InvalidUpdateNonce, update, previousState),
    );
  }

  // Handle double signed updates without validating params
  if (update.aliceSignature && update.bobSignature) {
    // Get final transfer balance (required when applying resolve updates);
    let finalTransferBalance: Balance | undefined = undefined;
    if (update.type === UpdateType.resolve) {
      // Resolve updates require the final transfer balance from the chainReader
      const transfer = activeTransfers.find(
        (t) => t.transferId === (update.details as ResolveUpdateDetails).transferId,
      );
      if (!transfer) {
        return Result.fail(
          new InboundChannelUpdateError(InboundChannelUpdateError.reasons.TransferNotFound, update, previousState, {
            existing: activeTransfers.map((t) => t.transferId),
          }),
        );
      }
      const transferBalanceResult = await chainReader.resolve(
        { ...(transfer! ?? {}), transferResolver: (update.details as ResolveUpdateDetails).transferResolver },
        previousState!.networkContext.chainId,
      );

      if (transferBalanceResult.isError) {
        return Result.fail(
          new InboundChannelUpdateError(transferBalanceResult.getError()!.message as any, update, previousState),
        );
      }
      finalTransferBalance = transferBalanceResult.getValue();
    }
    const applyRes = applyUpdate(update, previousState, activeTransfers, finalTransferBalance);
    if (applyRes.isError) {
      return Result.fail(
        new InboundChannelUpdateError(InboundChannelUpdateError.reasons.ApplyUpdateFailed, update, previousState, {
          error: applyRes.getError()!.message,
        }),
      );
    }
    const { updatedChannel, updatedActiveTransfers, updatedTransfer } = applyRes.getValue();
    const sigRes = await validateChannelUpdateSignatures(
      updatedChannel,
      update.aliceSignature,
      update.bobSignature,
      "both",
    );
    if (sigRes.isError) {
      return Result.fail(
        new InboundChannelUpdateError(InboundChannelUpdateError.reasons.BadSignatures, update, previousState, {
          error: sigRes.getError().message,
        }),
      );
    }
    // Return value
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

  // Always perform external validation on single signed updates
  const outboundRes = await externalValidation.validateInbound(update, previousState, activeTransfers);
  if (outboundRes.isError) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.ExternalValidationFailed, update, previousState, {
        error: outboundRes.getError()?.message,
      }),
    );
  }

  // Update is single signed, validate params + regenerate/apply
  // update
  const validRes = await validateParamsAndApplyUpdate(
    signer,
    chainReader,
    externalValidation,
    getParamsFromUpdate(update),
    previousState,
    activeTransfers,
    update.fromIdentifier,
  );
  if (validRes.isError) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.InboundValidationFailed, update, previousState, {
        error: validRes.getError()!.message,
        ...(validRes.getError()?.context ?? {}),
      }),
    );
  }

  const { updatedChannel, updatedActiveTransfers, updatedTransfer } = validRes.getValue();

  // Validate proper signatures on channel
  const sigRes = await validateChannelUpdateSignatures(
    updatedChannel,
    update.aliceSignature,
    update.bobSignature,
    signer.address === updatedChannel.bob ? "alice" : "bob",
  );
  if (sigRes.isError) {
    return Result.fail(
      new InboundChannelUpdateError(InboundChannelUpdateError.reasons.BadSignatures, update, previousState, {
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
    return Result.fail(new InboundChannelUpdateError(signedRes.getError()?.message as any, update, previousState));
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
