import { WithdrawCommitment } from "@connext/vector-contracts";
import {
  ChainAddresses,
  ChannelUpdateEvent,
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  DepositReconciledPayload,
  EngineEvents,
  FullChannelState,
  FullTransferState,
  IChannelSigner,
  IEngineStore,
  IMessagingService,
  IVectorChainService,
  IVectorProtocol,
  ProtocolEventName,
  TransferNames,
  SetupPayload,
  UpdateType,
  WithdrawalCreatedPayload,
  WithdrawalResolvedPayload,
  WITHDRAWAL_RECONCILED_EVENT,
  IVectorChainReader,
  REQUEST_COLLATERAL_EVENT,
  ChannelRpcMethods,
  EngineParams,
  ChannelRpcMethodsResponsesMap,
  Result,
  ChainError,
  EngineError,
  VectorError,
  IS_ALIVE_EVENT,
  Values,
  jsonifyError,
  GAS_ESTIMATES,
  WithdrawalQuote,
  IVectorStore,
} from "@connext/vector-types";
import {
  getRandomBytes32,
  TESTNETS_WITH_FEES,
  normalizeFee,
  hashWithdrawalQuote,
  recoverAddressFromChannelMessage,
  safeJsonStringify,
  mkSig,
  FeeCalculationError,
} from "@connext/vector-utils";
import { getAddress } from "@ethersproject/address";
import { BigNumber } from "@ethersproject/bignumber";
import { Zero } from "@ethersproject/constants";
import Pino, { BaseLogger } from "pino";

import { IsAliveError, RestoreError, WithdrawQuoteError } from "./errors";

import { EngineEvtContainer } from "./index";
import { normalizeGasFees } from "./utils";

export async function setupEngineListeners(
  evts: EngineEvtContainer,
  chainService: IVectorChainService,
  vector: IVectorProtocol,
  messaging: IMessagingService,
  signer: IChannelSigner,
  store: IEngineStore,
  chainAddresses: ChainAddresses,
  logger: Pino.BaseLogger,
  setup: (
    params: EngineParams.Setup,
  ) => Promise<Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_setup], EngineError>>,
  acquireRestoreLocks: (channel: FullChannelState) => Promise<Result<void, EngineError>>,
  releaseRestoreLocks: (channel: FullChannelState) => Promise<Result<void, EngineError>>,
  gasSubsidyPercentage: number,
): Promise<void> {
  // Set up listener for channel setup
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    (event) => handleSetup(event, signer, vector, evts, logger),
    (event) => {
      const {
        updatedChannelState: {
          latestUpdate: { type },
        },
      } = event;
      return type === UpdateType.setup;
    },
  );

  // Set up listener for deposit reconciliations
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    (event) => handleDepositReconciliation(event, signer, vector, evts, logger),
    (event) => {
      const {
        updatedChannelState: {
          latestUpdate: { type },
        },
      } = event;
      return type === UpdateType.deposit;
    },
  );

  // Set up listener for conditional transfer creations
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    async (event) => await handleConditionalTransferCreation(event, store, chainService, chainAddresses, evts, logger),
    (event) => {
      const {
        updatedChannelState: {
          latestUpdate: { type },
        },
      } = event;
      return type === UpdateType.create;
    },
  );

  // Set up listener for conditional transfer resolutions
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    async (event) =>
      await handleConditionalTransferResolution(event, chainAddresses, store, chainService, evts, logger),
    (event) => {
      const {
        updatedChannelState: {
          latestUpdate: { type },
        },
      } = event;
      return type === UpdateType.resolve;
    },
  );

  // Set up listener for withdrawal transfer creations
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    async (event) =>
      await handleWithdrawalTransferCreation(
        event,
        signer,
        vector,
        store,
        evts,
        chainAddresses,
        chainService,
        logger,
        gasSubsidyPercentage,
      ),
    (event) => {
      const {
        updatedChannelState: {
          latestUpdate: { type },
        },
      } = event;
      return type === UpdateType.create;
    },
  );

  // Set up listener for withdrawal resolutions
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    async (event) =>
      await handleWithdrawalTransferResolution(event, signer, store, evts, chainAddresses, chainService, logger),
    (event) => {
      const {
        updatedChannelState: {
          latestUpdate: { type },
        },
      } = event;
      return type === UpdateType.resolve;
    },
  );

  await messaging.onReceiveRestoreStateMessage(
    signer.publicIdentifier,
    async (
      restoreData: Result<{ chainId: number } | { channelAddress: string }, EngineError>,
      from: string,
      inbox: string,
    ) => {
      // If it is from yourself, do nothing
      if (from === signer.publicIdentifier) {
        return;
      }
      const method = "onReceiveRestoreStateMessage";
      logger.debug({ method }, "Handling message");

      // releases the lock, and acks to senders confirmation message
      const releaseLockAndAck = async (channelAddress: string, postToEvt = false) => {
        const channel = await store.getChannelState(channelAddress);
        if (!channel) {
          logger.error({ channelAddress }, "Failed to find channel to release lock");
          return;
        }
        await releaseRestoreLocks(channel);
        await messaging.respondToRestoreStateMessage(inbox, Result.ok(undefined));
        if (postToEvt) {
          // Post to evt
          evts[EngineEvents.RESTORE_STATE_EVENT].post({
            channelAddress: channel.channelAddress,
            aliceIdentifier: channel.aliceIdentifier,
            bobIdentifier: channel.bobIdentifier,
            chainId: channel.networkContext.chainId,
          });
        }
        return;
      };

      // Received error from counterparty
      if (restoreData.isError) {
        // releasing the lock should be done regardless of error
        logger.error({ message: restoreData.getError()!.message, method }, "Error received from counterparty restore");
        await releaseLockAndAck(restoreData.getError()!.context.channelAddress);
        return;
      }

      const data = restoreData.getValue();
      const [key] = Object.keys(data ?? []);
      if (key !== "chainId" && key !== "channelAddress") {
        logger.error({ data }, "Message malformed");
        return;
      }

      if (key === "channelAddress") {
        const { channelAddress } = data as { channelAddress: string };
        await releaseLockAndAck(channelAddress, true);
        return;
      }

      // Otherwise, they are looking to initiate a sync
      let channel: FullChannelState | undefined;
      const sendCannotRestoreFromError = (error: Values<typeof RestoreError.reasons>, context: any = {}) => {
        return messaging.respondToRestoreStateMessage(
          inbox,
          Result.fail(
            new RestoreError(error, channel?.channelAddress ?? "", signer.publicIdentifier, { ...context, method }),
          ),
        );
      };

      // Get info from store to send to counterparty
      const { chainId } = data as any;
      try {
        channel = await store.getChannelStateByParticipants(signer.publicIdentifier, from, chainId);
      } catch (e) {
        return sendCannotRestoreFromError(RestoreError.reasons.CouldNotGetChannel, {
          storeMethod: "getChannelStateByParticipants",
          chainId,
          identifiers: [signer.publicIdentifier, from],
        });
      }
      if (!channel) {
        return sendCannotRestoreFromError(RestoreError.reasons.ChannelNotFound, { chainId });
      }
      let activeTransfers: FullTransferState[];
      try {
        activeTransfers = await store.getActiveTransfers(channel.channelAddress);
      } catch (e) {
        return sendCannotRestoreFromError(RestoreError.reasons.CouldNotGetActiveTransfers, {
          storeMethod: "getActiveTransfers",
          chainId,
          channelAddress: channel.channelAddress,
        });
      }

      // Acquire lock
      const res = await acquireRestoreLocks(channel);
      if (res.isError) {
        return sendCannotRestoreFromError(RestoreError.reasons.AcquireLockError, {
          acquireLockError: jsonifyError(res.getError()!),
        });
      }

      // Send info to counterparty
      logger.debug(
        {
          channel: channel.channelAddress,
          nonce: channel.nonce,
          activeTransfers: activeTransfers.map((a) => a.transferId),
        },
        "Sending counterparty state to sync",
      );
      await messaging.respondToRestoreStateMessage(inbox, Result.ok({ channel, activeTransfers }));

      // Release lock on timeout regardless
      setTimeout(() => {
        releaseRestoreLocks(channel!);
      }, 15_000);
    },
  );

  await messaging.onReceiveIsAliveMessage(
    signer.publicIdentifier,
    async (
      params: Result<{ channelAddress: string; skipCheckIn?: boolean }, VectorError>,
      from: string,
      inbox: string,
    ) => {
      const needsResponse = from !== signer.publicIdentifier;
      const method = "onReceiveIsAliveMessage";
      const methodId = getRandomBytes32();
      if (params.isError) {
        logger.warn({ error: params.getError()?.message, method, methodId }, "Error received");
        return;
      }

      // get channel
      const { channelAddress } = params.getValue();
      const channel = await store.getChannelState(channelAddress);
      if (!channel) {
        logger.error({ channelAddress, method, methodId }, "Channel not found");
        needsResponse &&
          messaging.respondToIsAliveMessage(
            inbox,
            Result.fail(
              new IsAliveError(IsAliveError.reasons.ChannelNotFound, channelAddress, signer.publicIdentifier),
            ),
          );
        return;
      }

      // post to EVT
      evts[IS_ALIVE_EVENT].post({
        aliceIdentifier: channel.aliceIdentifier,
        bobIdentifier: channel.bobIdentifier,
        chainId: channel.networkContext.chainId,
        channelAddress: channel.channelAddress,
        skipCheckIn: params.getValue().skipCheckIn ?? false,
      });

      // handle hanging withdrawals
      // do NOT await this -- could involve 2+ onchain transactions:
      // one to deploy a channel and one to submit tx for each commitment
      resolveExistingWithdrawals(
        channel,
        signer,
        store,
        vector,
        chainAddresses,
        chainService,
        evts,
        logger,
        gasSubsidyPercentage,
      );

      // respond if necessary
      if (!needsResponse) {
        return;
      }
      await messaging.respondToIsAliveMessage(inbox, Result.ok({ channelAddress }));
      return;
    },
  );

  await messaging.onReceiveRequestCollateralMessage(signer.publicIdentifier, async (params, from, inbox) => {
    const method = "onReceiveRequestCollateralMessage";
    if (params.isError) {
      logger.error({ error: params.getError()?.message, method }, "Error received");
      return;
    }
    logger.info({ params: params.getValue(), method, from }, "Handling message");

    evts[REQUEST_COLLATERAL_EVENT].post({
      ...params.getValue(),
      aliceIdentifier: signer.publicIdentifier,
      bobIdentifier: from,
    });

    await messaging.respondToRequestCollateralMessage(
      inbox,
      Result.ok({ message: "Successfully requested collateral" }),
    );
  });

  await messaging.onReceiveSetupMessage(signer.publicIdentifier, async (params, from, inbox) => {
    const method = "onReceiveSetupMessage";
    if (params.isError) {
      logger.error({ error: params.getError()?.message, method }, "Error received");
      return;
    }
    const setupInfo = params.getValue();
    logger.info({ params: setupInfo, method }, "Handling message");
    const res = await setup({
      chainId: setupInfo.chainId,
      counterpartyIdentifier: from,
      timeout: setupInfo.timeout,
      meta: setupInfo.meta,
    });
    await messaging.respondToSetupMessage(
      inbox,
      res.isError ? Result.fail(res.getError()!) : Result.ok({ channelAddress: res.getValue().channelAddress }),
    );
  });

  await messaging.onReceiveWithdrawalQuoteMessage(signer.publicIdentifier, async (quoteRequest, from, inbox) => {
    const method = "onReceiveWithdrawalQuoteMessage";
    const methodId = getRandomBytes32();
    logger.info({ method, methodId, quoteRequest: quoteRequest.toJson() }, "Method started");
    if (quoteRequest.isError) {
      logger.error({ error: quoteRequest.getError()?.message, method, methodId }, "Error received");
      return;
    }
    const request = quoteRequest.getValue();
    logger.info({ ...request, method, methodId }, "Calculating quote");
    const calculatedQuote = await getWithdrawalQuote(
      request,
      gasSubsidyPercentage,
      signer,
      store,
      chainService,
      logger,
    );
    await messaging.respondToWithdrawalQuoteMessage(inbox, calculatedQuote);

    logger.info({ quote: calculatedQuote.toJson(), method, methodId }, "Method complete");
  });

  ////////////////////////////
  /// CHAIN SERVICE EVENTS
  chainService.on(EngineEvents.TRANSACTION_SUBMITTED, (data) => {
    evts[EngineEvents.TRANSACTION_SUBMITTED].post({
      ...data,
      publicIdentifier: signer.publicIdentifier,
    });
  });

  chainService.on(EngineEvents.TRANSACTION_MINED, (data) => {
    evts[EngineEvents.TRANSACTION_MINED].post({ ...data, publicIdentifier: signer.publicIdentifier });
  });

  chainService.on(EngineEvents.TRANSACTION_FAILED, (data) => {
    evts[EngineEvents.TRANSACTION_FAILED].post({ ...data, publicIdentifier: signer.publicIdentifier });
  });
}

export async function getWithdrawalQuote(
  request: EngineParams.GetWithdrawalQuote,
  gasSubsidyPercentage: number,
  signer: IChannelSigner,
  store: IVectorStore,
  chainService: IVectorChainService,
  logger: BaseLogger,
): Promise<Result<WithdrawalQuote, WithdrawQuoteError>> {
  // Get channel from store
  const channel = await store.getChannelState(request.channelAddress);
  if (!channel) {
    return Result.fail(
      new WithdrawQuoteError(WithdrawQuoteError.reasons.ChannelNotFound, signer.publicIdentifier, request),
    );
  }

  // First check to see if the channel is deployed
  const code = await chainService.getCode(request.channelAddress, channel.networkContext.chainId);
  if (code.isError) {
    return Result.fail(
      new WithdrawQuoteError(WithdrawQuoteError.reasons.ChainServiceFailure, signer.publicIdentifier, request, {
        chainServiceMethod: "getCode",
        error: jsonifyError(code.getError()!),
      }),
    );
  }

  const gasEstimate =
    code.getValue() !== "0x" ? GAS_ESTIMATES.withdraw : GAS_ESTIMATES.withdraw.add(GAS_ESTIMATES.createChannel);

  // Get the gas price
  const gasPrice = await chainService.getGasPrice(channel.networkContext.chainId);
  if (gasPrice.isError) {
    return Result.fail(
      new WithdrawQuoteError(WithdrawQuoteError.reasons.ChainServiceFailure, signer.publicIdentifier, request, {
        chainServiceMethod: "getGasPrice",
        error: jsonifyError(gasPrice.getError()!),
      }),
    );
  }

  // Convert ethFee to price in given `assetId`
  const assetDecimals = await chainService.getDecimals(request.assetId, channel.networkContext.chainId);
  if (assetDecimals.isError) {
    return Result.fail(
      new WithdrawQuoteError(WithdrawQuoteError.reasons.ChainServiceFailure, signer.publicIdentifier, request, {
        chainServiceMethod: "getDecimals",
        error: jsonifyError(assetDecimals.getError()!),
      }),
    );
  }

  const normalizedGasCost =
    channel.networkContext.chainId === 1 || TESTNETS_WITH_FEES.includes(channel.networkContext.chainId) // fromAsset MUST be on mainnet or hardcoded
      ? await normalizeGasFees(
          gasEstimate,
          18,
          request.assetId,
          assetDecimals.getValue(),
          channel.networkContext.chainId,
          chainService,
          logger,
        )
      : Result.ok(Zero);

  if (normalizedGasCost.isError) {
    return Result.fail(
      new WithdrawQuoteError(WithdrawQuoteError.reasons.ExchangeRateError, signer.publicIdentifier, request, {
        error: jsonifyError(normalizedGasCost.getError()!),
      }),
    );
  }

  const fee = normalizedGasCost
    .getValue()
    .mul(100 - gasSubsidyPercentage)
    .div(100);

  // Sign the quote + return to user
  const quote = {
    channelAddress: request.channelAddress,
    amount: fee.gt(request.amount) ? "0" : BigNumber.from(request.amount).sub(fee).toString(), // hash of negative value fails
    assetId: request.assetId,
    fee: fee.toString(),
    expiry: (Date.now() + 30_000).toString(),
  };
  try {
    const signature = await signer.signMessage(hashWithdrawalQuote(quote));
    return Result.ok({ ...quote, signature });
  } catch (e) {
    return Result.fail(
      new WithdrawQuoteError(WithdrawQuoteError.reasons.SignatureFailure, signer.publicIdentifier, request, {
        error: jsonifyError(e),
      }),
    );
  }
}

export async function resolveExistingWithdrawals(
  channel: FullChannelState,
  signer: IChannelSigner,
  store: IEngineStore,
  vector: IVectorProtocol,
  chainAddresses: ChainAddresses,
  chainService: IVectorChainService,
  evts: EngineEvtContainer,
  logger: BaseLogger,
  gasSubsidyPercentage: number,
): Promise<void> {
  const method = "resolveExistingWithdrawals";
  const methodId = getRandomBytes32();
  // check for withdrawals between you and counterparty that need to be resolved
  // by you
  const activeTransfers = await vector.getActiveTransfers(channel.channelAddress);
  logger.info({ method, methodId }, "Got active transfers in isAlive channel");
  // active transfer needs to be a withdrawal
  // isWithdrawTransfer is async so it needs to be awaited
  const withdrawalsOnlyPromises = await Promise.all(
    activeTransfers.map(async (transfer) => {
      const isWithdraw = await isWithdrawTransfer(transfer, chainAddresses, chainService);
      return !isWithdraw.isError && isWithdraw.getValue() ? transfer : undefined;
    }),
  );
  const withdrawalsOnly = withdrawalsOnlyPromises.filter((x) => !!x); // filter undefined
  const withdrawalsToComplete = withdrawalsOnly.filter(async (transfer) => {
    return transfer!.responderIdentifier === signer.publicIdentifier;
  });
  await Promise.all(
    withdrawalsToComplete.map(async (transfer) => {
      logger.info({ method, methodId, transfer: transfer!.transferId }, "Found withdrawal to handle");
      await resolveWithdrawal(
        channel,
        transfer!,
        vector,
        evts,
        store,
        signer,
        chainService,
        logger,
        gasSubsidyPercentage,
      );
      logger.info({ method, methodId, transfer: transfer!.transferId }, "Resolved withdrawal");
    }),
  );
}

function handleSetup(
  event: ChannelUpdateEvent,
  signer: IChannelSigner,
  vector: IVectorProtocol,
  evts: EngineEvtContainer,
  logger: Pino.BaseLogger,
): void {
  logger.info({ channelAddress: event.updatedChannelState.channelAddress }, "Handling setup event");
  // Emit the properly structured event
  const {
    channelAddress,
    aliceIdentifier,
    bobIdentifier,
    networkContext: { chainId },
    latestUpdate: {
      details: { meta },
    },
  } = event.updatedChannelState as FullChannelState;
  const payload: SetupPayload = {
    channelAddress,
    aliceIdentifier,
    bobIdentifier,
    chainId,
    meta,
  };
  evts[EngineEvents.SETUP].post(payload);
}

function handleDepositReconciliation(
  event: ChannelUpdateEvent,
  signer: IChannelSigner,
  vector: IVectorProtocol,
  evts: EngineEvtContainer,
  logger: Pino.BaseLogger,
): void {
  logger.info({ channelAddress: event.updatedChannelState.channelAddress }, "Handling deposit reconciliation event");
  // Emit the properly structured event
  const {
    aliceIdentifier,
    bobIdentifier,
    channelAddress,
    balances,
    assetIds,
    latestUpdate: {
      assetId,
      details: { meta },
    },
  } = event.updatedChannelState as FullChannelState;
  const payload: DepositReconciledPayload = {
    aliceIdentifier,
    bobIdentifier,
    channelAddress,
    assetId,
    channelBalance: balances[assetIds.findIndex((a) => getAddress(a) === getAddress(assetId))],
    meta,
  };
  evts[EngineEvents.DEPOSIT_RECONCILED].post(payload);
}

async function handleConditionalTransferCreation(
  event: ChannelUpdateEvent,
  store: IEngineStore,
  chainService: IVectorChainReader,
  chainAddresses: ChainAddresses,
  evts: EngineEvtContainer,
  logger: Pino.BaseLogger,
): Promise<void> {
  const isWithdrawRes = await isWithdrawTransfer(event.updatedTransfer!, chainAddresses, chainService);
  if (isWithdrawRes.isError) {
    logger.warn(
      { method: "isWithdrawRes", ...isWithdrawRes.getError()!.context },
      "Failed to determine if transfer is withdrawal",
    );
    return;
  }
  if (isWithdrawRes.getValue()) {
    return;
  }
  const {
    aliceIdentifier,
    bobIdentifier,
    assetIds,
    balances,
    channelAddress,
    networkContext: { chainId },
    latestUpdate: {
      assetId,
      details: {
        transferId,
        transferDefinition,
        meta: { routingId },
      },
    },
  } = event.updatedChannelState as FullChannelState;
  logger.info({ channelAddress }, "Handling conditional transfer create event");
  // Emit the properly structured event
  const transfer = event.updatedTransfer;
  if (!transfer) {
    logger.warn({ transferId }, "Transfer not found after creation");
    return;
  }

  const registryInfo = await chainService.getRegisteredTransferByDefinition(
    transferDefinition,
    chainAddresses[chainId].transferRegistryAddress,
    chainId,
  );
  let conditionType: string;
  if (registryInfo.isError) {
    logger.warn({ error: registryInfo.getError()!.message }, "Failed to get registry info");
    conditionType = transferDefinition;
  } else {
    conditionType = registryInfo.getValue().name;
  }

  const assetIdx = assetIds.findIndex((a) => getAddress(a) === getAddress(assetId));
  const payload: ConditionalTransferCreatedPayload = {
    aliceIdentifier,
    bobIdentifier,
    channelAddress,
    channelBalance: balances[assetIdx],
    transfer,
    conditionType,
    activeTransferIds: event.updatedTransfers?.map((t) => t.transferId),
  };
  evts[EngineEvents.CONDITIONAL_TRANSFER_CREATED].post(payload);

  // If we should not route the transfer, do nothing
  if (!routingId || transfer.meta?.routingId !== routingId) {
    logger.warn({ transferId, routingId, meta: transfer.meta }, "Cannot route transfer");
    return;
  }

  // TODO: add automatic resolution for given transfer types
}

async function handleConditionalTransferResolution(
  event: ChannelUpdateEvent,
  chainAddresses: ChainAddresses,
  store: IEngineStore,
  chainService: IVectorChainReader,
  evts: EngineEvtContainer,
  logger: Pino.BaseLogger,
): Promise<void> {
  const isWithdrawRes = await isWithdrawTransfer(event.updatedTransfer!, chainAddresses, chainService);
  if (isWithdrawRes.isError) {
    logger.warn(
      { method: "isWithdrawRes", ...isWithdrawRes.getError()!.context },
      "Failed to determine if transfer is withdrawal",
    );
    return;
  }
  if (isWithdrawRes.getValue()) {
    return;
  }
  logger.info(
    { channelAddress: event.updatedChannelState.channelAddress },
    "Handling conditional transfer resolve event",
  );
  const {
    aliceIdentifier,
    bobIdentifier,
    channelAddress,
    assetIds,
    balances,
    networkContext: { chainId },
    latestUpdate: {
      assetId,
      details: { transferDefinition },
    },
  } = event.updatedChannelState as FullChannelState;
  // Emit the properly structured event
  const registryInfo = await chainService.getRegisteredTransferByDefinition(
    transferDefinition,
    chainAddresses[chainId].transferRegistryAddress,
    chainId,
  );
  let conditionType: string;
  if (registryInfo.isError) {
    logger.warn({ error: registryInfo.getError()!.message }, "Faild to get registry info");
    conditionType = transferDefinition;
  } else {
    conditionType = registryInfo.getValue().name;
  }
  const transfer = event.updatedTransfer;
  const payload: ConditionalTransferResolvedPayload = {
    aliceIdentifier,
    bobIdentifier,
    channelAddress,
    channelBalance: balances[assetIds.findIndex((a) => getAddress(a) === getAddress(assetId))],
    transfer: transfer!,
    conditionType,
    activeTransferIds: event.updatedTransfers?.map((t) => t.transferId),
  };
  evts[EngineEvents.CONDITIONAL_TRANSFER_RESOLVED].post(payload);
}

async function handleWithdrawalTransferCreation(
  event: ChannelUpdateEvent,
  signer: IChannelSigner,
  vector: IVectorProtocol,
  store: IEngineStore,
  evts: EngineEvtContainer,
  chainAddresses: ChainAddresses,
  chainService: IVectorChainService,
  logger: Pino.BaseLogger,
  gasSubsidyPercentage: number,
): Promise<void> {
  const isWithdrawRes = await isWithdrawTransfer(event.updatedTransfer!, chainAddresses, chainService);
  if (isWithdrawRes.isError) {
    logger.warn(
      { method: "handleWithdrawalTransferCreation", error: jsonifyError(isWithdrawRes.getError()!) },
      "Failed to determine if transfer is withdrawal",
    );
    return;
  }
  if (!isWithdrawRes.getValue()) {
    return;
  }
  await resolveWithdrawal(
    event.updatedChannelState,
    event.updatedTransfer!,
    vector,
    evts,
    store,
    signer,
    chainService,
    logger,
    gasSubsidyPercentage,
  );
}

async function handleWithdrawalTransferResolution(
  event: ChannelUpdateEvent,
  signer: IChannelSigner,
  store: IEngineStore,
  evts: EngineEvtContainer,
  chainAddresses: ChainAddresses,
  chainService: IVectorChainService,
  logger: Pino.BaseLogger = Pino(),
): Promise<void> {
  const isWithdrawRes = await isWithdrawTransfer(event.updatedTransfer!, chainAddresses, chainService);
  if (isWithdrawRes.isError) {
    logger.warn(
      { method: "isWithdrawRes", ...isWithdrawRes.getError()!.context },
      "Failed to determine if transfer is withdrawal",
    );
    return;
  }
  if (!isWithdrawRes.getValue()) {
    return;
  }
  const method = "handleWithdrawalTransferResolution";
  const methodId = getRandomBytes32();

  const {
    aliceIdentifier,
    bobIdentifier,
    channelAddress,
    balances,
    assetIds,
    alice,
    bob,
    latestUpdate: {
      details: { transferId, meta },
      assetId,
      fromIdentifier,
    },
  } = event.updatedChannelState as FullChannelState;
  logger.info({ method, channelAddress, transferId, methodId }, "Started");

  // Get the withdrawal amount
  if (!event.updatedTransfer) {
    logger.warn({ method, transferId, channelAddress }, "Could not find transfer for withdrawal resolution");
    return;
  }

  const withdrawalAmount = event.updatedTransfer.balance.amount
    .reduce((prev, curr) => prev.add(curr), BigNumber.from(0))
    .sub(event.updatedTransfer.transferState.fee);

  logger.info(
    {
      method,
      methodId,
      withdrawalAmount: withdrawalAmount.toString(),
      initiator: event.updatedTransfer.initiator,
      responder: event.updatedTransfer.responder,
      fee: event.updatedTransfer.transferState.fee,
    },
    "Withdrawal info",
  );

  // Post to evt
  const assetIdx = assetIds.findIndex((a) => getAddress(a) === getAddress(assetId));
  const payload: WithdrawalResolvedPayload = {
    aliceIdentifier,
    bobIdentifier,
    assetId,
    amount: withdrawalAmount.toString(),
    fee: event.updatedTransfer.transferState.fee,
    recipient: event.updatedTransfer.balance.to[0],
    channelBalance: balances[assetIdx],
    channelAddress,
    transfer: event.updatedTransfer,
    callTo: event.updatedTransfer.transferState.callTo,
    callData: event.updatedTransfer.transferState.callData,
  };
  evts[EngineEvents.WITHDRAWAL_RESOLVED].post(payload);

  // If it is not from counterparty, do not respond
  if (fromIdentifier === signer.publicIdentifier) {
    logger.debug(
      { method, methodId, withdrawalAmount: withdrawalAmount.toString(), assetId },
      "Our own resolution, no need to do anything",
    );
    return;
  }

  // Generate our own commitment, and save the double signed version
  // NOTE: while generalized withdrawals are enabled, they have not been
  // added to the engine parameters (standard withdrawals permitted only)
  const commitment = new WithdrawCommitment(
    channelAddress,
    alice,
    bob,
    event.updatedTransfer.balance.to[0],
    assetId,
    withdrawalAmount.toString(),
    event.updatedTransfer.transferState.nonce,
    event.updatedTransfer.transferState.callTo,
    event.updatedTransfer.transferState.callData,
    meta?.transactionHash ?? undefined,
  );
  await commitment.addSignatures(
    event.updatedTransfer.transferState.initiatorSignature,
    event.updatedTransfer.transferResolver!.responderSignature,
  );

  // Try to submit the transaction to chain IFF you are alice
  // Otherwise, alice should have submitted the tx (hash is in meta)
  if (signer.address !== alice) {
    // Withdrawal resolution meta will include the transaction hash,
    // post to EVT here
    evts[WITHDRAWAL_RECONCILED_EVENT].post({
      aliceIdentifier,
      bobIdentifier,
      channelAddress,
      transferId,
      transactionHash: meta?.transactionHash,
      meta: event.updatedTransfer.meta,
    });
    // Store the double signed commitment
    await store.saveWithdrawalCommitment(transferId, commitment.toJson());
    logger.info({ method, methodId, withdrawalAmount: withdrawalAmount.toString(), assetId }, "Completed");
    return;
  }

  // Here, alice is handling her own resolved withdrawals

  // If it is mainnet, alice should hold the withdrawals and submit them
  // at a lower gas price.
  // NOTE: The logic to hold withdrawals until gas price is lower exists in
  // the server-node ONLY. This makes the implicit assumption that browser-nodes
  // will *NOT* be alice. This is safe because this assumption is also made
  // on setup when the browser-node will always `requestSetup`
  if (event.updatedChannelState.networkContext.chainId === 1) {
    await store.saveWithdrawalCommitment(transferId, commitment.toJson());
    logger.debug({ method, channel: event.updatedChannelState.channelAddress }, "Holding mainnet withdrawal");
    return;
  }

  // Submit withdrawal to chain IFF not mainnet
  const withdrawalResponse = await chainService.sendWithdrawTx(
    event.updatedChannelState,
    commitment.getSignedTransaction(),
  );

  if (withdrawalResponse.isError) {
    // Store the double signed commitment
    await store.saveWithdrawalCommitment(transferId, commitment.toJson());
    logger.warn(
      { method, error: withdrawalResponse.getError()!.message, channelAddress, transferId },
      "Failed to submit withdraw",
    );
    return;
  }
  const tx = withdrawalResponse.getValue();
  commitment.addTransaction(tx.hash);
  await store.saveWithdrawalCommitment(transferId, commitment.toJson());

  // alice submitted her own withdrawal, post to evt
  evts[WITHDRAWAL_RECONCILED_EVENT].post({
    aliceIdentifier,
    bobIdentifier,
    channelAddress,
    transferId,
    transactionHash: tx.hash,
  });
  logger.info({ transactionHash: tx.hash }, "Submitted withdraw tx");
  const receipt = await tx.wait();
  if (receipt.status === 0) {
    logger.error({ method, receipt }, "Withdraw tx reverted");
  } else {
    logger.info({ method, transactionHash: receipt.transactionHash }, "Withdraw tx mined, completed");
  }
}

const isWithdrawTransfer = async (
  transfer: FullTransferState,
  chainAddresses: ChainAddresses,
  chainService: IVectorChainReader,
): Promise<Result<boolean, ChainError>> => {
  const withdrawInfo = await chainService.getRegisteredTransferByName(
    TransferNames.Withdraw,
    chainAddresses[transfer.chainId].transferRegistryAddress,
    transfer.chainId,
  );
  if (withdrawInfo.isError) {
    return Result.fail(withdrawInfo.getError()!);
  }
  const { definition } = withdrawInfo.getValue();
  return Result.ok(transfer.transferDefinition === definition);
};

export const resolveWithdrawal = async (
  channelState: FullChannelState,
  transfer: FullTransferState,
  vector: IVectorProtocol,
  evts: EngineEvtContainer,
  store: IEngineStore,
  signer: IChannelSigner,
  chainService: IVectorChainService,
  logger: BaseLogger,
  gasSubsidyPercentage: number,
): Promise<void> => {
  const method = "resolveWithdrawal";
  const methodId = getRandomBytes32();

  // If you receive a withdrawal creation, you should
  // resolve the withdrawal with your signature
  const {
    aliceIdentifier,
    bobIdentifier,
    channelAddress,
    balances,
    assetIds,
    alice,
    bob,
  } = channelState as FullChannelState;
  logger.info(
    { channelAddress, transferId: transfer.transferId, assetId: transfer.assetId, method, methodId },
    "Started",
  );

  // Get the recipient + amount from the transfer state
  const {
    meta,
    assetId,
    balance,
    initiatorIdentifier,
    transferId,
    transferState: { nonce, initiatorSignature, fee, initiator, responder, callTo, callData },
  } = transfer;

  const withdrawalAmount = balance.amount.reduce((prev, curr) => prev.add(curr), BigNumber.from(0)).sub(fee);
  logger.debug({ withdrawalAmount: withdrawalAmount.toString(), initiator, responder, fee }, "Withdrawal info");

  // Post to evt
  const assetIdx = assetIds.findIndex((a) => getAddress(a) === getAddress(assetId));
  const payload: WithdrawalCreatedPayload = {
    aliceIdentifier,
    bobIdentifier,
    assetId,
    amount: withdrawalAmount.toString(),
    fee,
    recipient: balance.to[0],
    channelBalance: balances[assetIdx],
    channelAddress,
    transfer,
    callTo,
    callData,
  };
  evts[EngineEvents.WITHDRAWAL_CREATED].post(payload);

  // If it is not from counterparty, do not respond
  if (initiatorIdentifier === signer.publicIdentifier) {
    logger.info({ method }, "Waiting for counterparty sig");
    return;
  }

  // Verify fee is present, signed correctly, and not expired IFF configured and
  // channel is on proper chain
  const relevantChain = transfer.chainId === 1 || TESTNETS_WITH_FEES.includes(transfer.chainId);
  if (gasSubsidyPercentage !== 100 && signer.address === channelState.alice && relevantChain) {
    const cancelWithdrawal = async (cancellationReason: string) => {
      logger.warn({ cancellationReason, transferId, channelAddress, method, methodId }, "Cancelling withdrawal");
      const resolveRes = await vector.resolve({
        transferResolver: { responderSignature: mkSig("0x0") },
        transferId,
        channelAddress,
        meta: { ...(meta ?? {}), cancellationReason },
      });

      // Handle the error
      if (resolveRes.isError) {
        logger.error(
          {
            method,
            error: resolveRes.getError()!.message,
            transferId,
            channelAddress,
            transactionHash,
          },
          "Failed to cancel withdrawal",
        );
        return;
      }
    };
    // configured
    const { quote } = meta ?? {};
    if (!quote) {
      // cancel withdrawal
      await cancelWithdrawal("Missing withdrawal quote");
      return;
    }
    if (parseInt(quote.expiry) < Date.now()) {
      await cancelWithdrawal("Withdrawal quote expired, please retry");
      return;
    }
    try {
      const recreated = {
        channelAddress: transfer.channelAddress,
        amount: withdrawalAmount.toString(),
        assetId,
        fee,
        expiry: quote.expiry,
      };
      const recovered = await recoverAddressFromChannelMessage(hashWithdrawalQuote(recreated), quote.signature);
      if (recovered !== channelState.alice) {
        throw new Error(
          `Got ${recovered} expected ${channelState.alice} on ${safeJsonStringify(
            recreated,
          )}. (Quote: ${safeJsonStringify(quote)})`,
        );
      }
    } catch (e) {
      await cancelWithdrawal(`Withdrawal quote recovery failed: ${e.message}`);
      return;
    }
    logger.info({ quote, method, methodId }, "Withdrawal fees verified");
  }

  // TODO: should inject validation to make sure that a withdrawal transfer
  // is properly signed before its been merged into your channel
  const commitment = new WithdrawCommitment(
    channelAddress,
    alice,
    bob,
    balance.to[0],
    assetId,
    withdrawalAmount.toString(),
    nonce,
    callTo,
    callData,
  );

  // Generate your signature on the withdrawal commitment
  const responderSignature = await signer.signMessage(commitment.hashToSign());
  await commitment.addSignatures(initiatorSignature, responderSignature);

  // Assume that only alice will try to submit the withdrawal to chain.
  // Alice may or may not charge a fee for this service, and both parties
  // are welcome to submit the commitment if the other party does not.

  // TODO: if bob is the withdrawal creator and alice has charged a fee
  // for submitting the withdrawal, bob will refuse to sign the resolve
  // update until the transaction is properly submitted onchain (enforced
  // via injected validation)
  let transactionHash: string | undefined = undefined;
  if (signer.address === alice) {
    // Submit withdrawal to chain
    logger.info(
      { method, withdrawalAmount: withdrawalAmount.toString(), channelAddress },
      "Submitting withdrawal to chain",
    );
    const withdrawalResponse = await chainService.sendWithdrawTx(channelState, commitment.getSignedTransaction());

    // IFF the withdrawal was successfully submitted, resolve the transfer
    // with the transactionHash in the meta
    if (!withdrawalResponse.isError) {
      transactionHash = withdrawalResponse.getValue()!.hash;
      logger.info({ method, transactionHash }, "Submitted tx");
      // Post to reconciliation evt on submission
      evts[WITHDRAWAL_RECONCILED_EVENT].post({
        aliceIdentifier,
        bobIdentifier,
        channelAddress,
        transferId,
        transactionHash,
      });
    } else {
      // log the transaction error, try to resolve with an undefined hash
      logger.error({ error: withdrawalResponse.getError()!.message, method }, "Failed to submit tx");
    }
  }
  commitment.addTransaction(transactionHash);
  // Store the double signed commitment
  await store.saveWithdrawalCommitment(transfer.transferId, commitment.toJson());

  // Resolve withdrawal from counterparty
  // See note above re: fees + injected validation
  const resolveMeta = { transactionHash, ...(meta ?? {}) };
  const resolveRes = await vector.resolve({
    transferResolver: { responderSignature },
    transferId,
    channelAddress,
    meta: resolveMeta,
  });

  // Handle the error
  if (resolveRes.isError) {
    logger.error(
      {
        method,
        error: resolveRes.getError()!.message,
        transferId,
        channelAddress,
        transactionHash,
      },
      "Failed to resolve",
    );
    return;
  }

  // Withdrawal successfully resolved
  logger.info({ method, amount: withdrawalAmount.toString(), assetId: transfer.assetId, fee }, "Withdrawal resolved");
};
