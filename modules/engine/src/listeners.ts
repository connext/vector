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
  ResolveUpdateDetails,
  TransferNames,
  SetupPayload,
  UpdateType,
  WithdrawalCreatedPayload,
  WithdrawalResolvedPayload,
  WITHDRAWAL_RECONCILED_EVENT,
  WithdrawState,
  IVectorChainReader,
  REQUEST_COLLATERAL_EVENT,
  ChannelRpcMethods,
  EngineParams,
  ChannelRpcMethodsResponsesMap,
  Result,
  ChainError,
  EngineError,
  CheckInResponse,
  VectorError,
  IS_ALIVE_EVENT,
  Values,
  jsonifyError,
} from "@connext/vector-types";
import { getRandomBytes32 } from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import Pino, { BaseLogger } from "pino";

import { CheckInError, IsAliveError, RestoreError } from "./errors";

import { EngineEvtContainer } from "./index";

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
      await handleWithdrawalTransferCreation(event, signer, vector, store, evts, chainAddresses, chainService, logger),
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

  // TODO: how to monitor for withdrawal reconciliations (onchain tx submitted)
  // who will submit the transaction? should both engines watch the multisig
  // indefinitely?

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
    async (params: Result<{ channelAddress: string }, VectorError>, from: string, inbox: string) => {
      if (from === signer.publicIdentifier) {
        return;
      }
      const method = "onReceiveIsAliveMessage";
      const methodId = getRandomBytes32();
      if (params.isError) {
        logger.warn({ error: params.getError()?.message, method, methodId }, "Error received");
        return;
      }

      const { channelAddress } = params.getValue();
      await handleIsAlive(
        from,
        inbox,
        channelAddress,
        signer,
        store,
        messaging,
        chainAddresses,
        chainService,
        vector,
        evts,
        logger,
      );
    },
  );

  await messaging.onReceiveIsAliveMessage(signer.publicIdentifier, async (params, from, inbox) => {
    if (from === signer.publicIdentifier) {
      return;
    }
    const method = "onReceiveIsAliveMessage";
    if (params.isError) {
      logger.error({ error: params.getError()?.message, method }, "Error received");
      return;
    }
    logger.info({ params: params.getValue(), method, from }, "Handling message");
    const channel = await store.getChannelState(params.getValue().channelAddress);
    let response: Result<CheckInResponse, CheckInError>;
    if (!channel) {
      logger.error({ params: params.getValue(), method }, "Could not find channel for received isAlive message");
      response = Result.fail(
        new CheckInError(
          CheckInError.reasons.ChannelNotFound,
          params.getValue().channelAddress,
          signer.publicIdentifier,
        ),
      );
    } else {
      response = Result.ok({
        aliceIdentifier: channel.aliceIdentifier,
        bobIdentifier: channel.bobIdentifier,
        chainId: channel.networkContext.chainId,
        channelAddress: channel.channelAddress,
        skipCheckIn: params.getValue().skipCheckIn,
      });
      evts[IS_ALIVE_EVENT].post(response.getValue());
    }

    await messaging.respondToIsAliveMessage(inbox, response);
  });

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
}

export async function handleIsAlive(
  from: string,
  inbox: string,
  channelAddress: string,
  signer: IChannelSigner,
  store: IEngineStore,
  messaging: IMessagingService,
  chainAddresses: ChainAddresses,
  chainService: IVectorChainService,
  vector: IVectorProtocol,
  evts: EngineEvtContainer,
  logger: BaseLogger,
): Promise<void> {
  const method = "handleIsAlive";
  const methodId = getRandomBytes32();

  const channel = await store.getChannelState(channelAddress);

  if (!channel) {
    logger.error({ channelAddress, method, methodId }, "Channel not found");
    return messaging.respondToIsAliveMessage(
      inbox,
      Result.fail(new IsAliveError(IsAliveError.reasons.ChannelNotFound, channelAddress, signer.publicIdentifier)),
    );
  }

  // TODO: why is this here
  // // Post to evt (i.e. so router can track responses)
  // evts[IS_ALIVE_EVENT].post({
  //   channelAddress,
  // });

  // check for withdrawals between you and counterparty that need to be resolved
  const activeTransfers = await vector.getActiveTransfers(channelAddress);
  logger.info({ method, methodId }, "Got active transfers in isAlive channel");
  // active transfer needs to be a withdrawal
  const withdrawalsToComplete = activeTransfers.filter(
    (transfer) =>
      isWithdrawTransfer({ updatedChannelState: channel }, chainAddresses, chainService) &&
      transfer.initiatorIdentifier === from &&
      !transfer.transferResolver,
  );
  await Promise.all(
    withdrawalsToComplete.map(async (transfer) => {
      logger.info({ method, methodId, transfer }, "Found withdrawal to handle");
      await resolveWithdrawal(channel, vector, evts, store, signer, chainService, logger);
      logger.info({ method, methodId, transfer }, "Resolved withdrawal");
    }),
  );

  // should be safe to wait until the above is finished, it shouldnt take too long to resolve withdrawals
  // Just return an ack
  return messaging.respondToIsAliveMessage(inbox, Result.ok({ channelAddress }));
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
    channelBalance: balances[assetIds.findIndex((a) => a === assetId)],
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
  const isWithdrawRes = await isWithdrawTransfer(event, chainAddresses, chainService);
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

  const assetIdx = assetIds.findIndex((a) => a === assetId);
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
  const isWithdrawRes = await isWithdrawTransfer(event, chainAddresses, chainService);
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
    channelBalance: balances[assetIds.findIndex((a) => a === assetId)],
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
): Promise<void> {
  const isWithdrawRes = await isWithdrawTransfer(event, chainAddresses, chainService);
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
  await resolveWithdrawal(event.updatedChannelState, vector, evts, store, signer, chainService, logger);
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
  const isWithdrawRes = await isWithdrawTransfer(event, chainAddresses, chainService);
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
  logger.info({ method, channelAddress, transferId }, "Started");

  // Get the withdrawal amount
  const transfer = (await store.getTransferState(transferId)) as FullTransferState;
  if (!transfer) {
    logger.warn({ method, transferId, channelAddress }, "Could not find transfer for withdrawal resolution");
    return;
  }

  const withdrawalAmount = transfer.balance.amount
    .reduce((prev, curr) => prev.add(curr), BigNumber.from(0))
    .sub(transfer.transferState.fee);

  logger.debug(
    {
      method,
      withdrawalAmount: withdrawalAmount.toString(),
      initiator: transfer.initiator,
      responder: transfer.responder,
      fee: transfer.transferState.fee,
    },
    "Withdrawal info",
  );

  // Post to evt
  const assetIdx = assetIds.findIndex((a) => a === assetId);
  const payload: WithdrawalResolvedPayload = {
    aliceIdentifier,
    bobIdentifier,
    assetId,
    amount: withdrawalAmount.toString(),
    fee: transfer.transferState.fee,
    recipient: transfer.balance.to[0],
    channelBalance: balances[assetIdx],
    channelAddress,
    transfer,
    callTo: transfer.transferState.callTo,
    callData: transfer.transferState.callData,
  };
  evts[EngineEvents.WITHDRAWAL_RESOLVED].post(payload);

  // If it is not from counterparty, do not respond
  if (fromIdentifier === signer.publicIdentifier) {
    logger.info({ method, withdrawalAmount: withdrawalAmount.toString(), assetId }, "Completed");
    return;
  }

  // Generate our own commitment, and save the double signed version
  // NOTE: while generalized withdrawals are enabled, they have not been
  // added to the engine parameters (standard withdrawals permitted only)
  const commitment = new WithdrawCommitment(
    channelAddress,
    alice,
    bob,
    transfer.balance.to[0],
    assetId,
    withdrawalAmount.toString(),
    transfer.transferState.nonce,
  );
  await commitment.addSignatures(
    transfer.transferState.initiatorSignature,
    transfer.transferResolver!.responderSignature,
  );

  // Store the double signed commitment
  await store.saveWithdrawalCommitment(transferId, commitment.toJson());

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
      meta: transfer.meta,
    });
    logger.info({ method, withdrawalAmount: withdrawalAmount.toString(), assetId }, "Completed");
    return;
  }

  // Submit withdrawal to chain
  const withdrawalResponse = await chainService.sendWithdrawTx(
    event.updatedChannelState,
    await commitment.getSignedTransaction(),
  );

  if (withdrawalResponse.isError) {
    logger.warn(
      { method, error: withdrawalResponse.getError()!.message, channelAddress, transferId },
      "Failed to submit withdraw",
    );
    return;
  }

  const tx = withdrawalResponse.getValue()!;
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
  event: ChannelUpdateEvent,
  chainAddresses: ChainAddresses,
  chainService: IVectorChainReader,
): Promise<Result<boolean, ChainError>> => {
  const {
    updatedChannelState: {
      latestUpdate: { details },
      networkContext: { chainId },
    },
  } = event;
  const withdrawInfo = await chainService.getRegisteredTransferByName(
    TransferNames.Withdraw,
    chainAddresses[chainId].transferRegistryAddress,
    chainId,
  );
  if (withdrawInfo.isError) {
    return Result.fail(withdrawInfo.getError()!);
  }
  const { definition } = withdrawInfo.getValue();
  return Result.ok((details as ResolveUpdateDetails).transferDefinition === definition);
};

export const resolveWithdrawal = async (
  channelState: FullChannelState,
  vector: IVectorProtocol,
  evts: EngineEvtContainer,
  store: IEngineStore,
  signer: IChannelSigner,
  chainService: IVectorChainService,
  logger: BaseLogger,
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
    latestUpdate: {
      details: { transferId, transferInitialState },
      assetId,
      fromIdentifier,
    },
  } = channelState as FullChannelState;
  logger.info({ channelAddress, transferId, assetId, method, methodId }, "Started");

  // Get the recipient + amount from the transfer state
  const transfer = (await store.getTransferState(transferId))!;
  const {
    nonce,
    initiatorSignature,
    fee,
    initiator,
    responder,
    callTo,
    callData,
  } = transferInitialState as WithdrawState;

  const withdrawalAmount = transfer.balance.amount.reduce((prev, curr) => prev.add(curr), BigNumber.from(0)).sub(fee);
  logger.debug({ withdrawalAmount: withdrawalAmount.toString(), initiator, responder, fee }, "Withdrawal info");

  // Post to evt
  const assetIdx = assetIds.findIndex((a) => a === assetId);
  const payload: WithdrawalCreatedPayload = {
    aliceIdentifier,
    bobIdentifier,
    assetId,
    amount: withdrawalAmount.toString(),
    fee,
    recipient: transfer.balance.to[0],
    channelBalance: balances[assetIdx],
    channelAddress,
    transfer,
    callTo,
    callData,
  };
  evts[EngineEvents.WITHDRAWAL_CREATED].post(payload);

  // If it is not from counterparty, do not respond
  if (fromIdentifier === signer.publicIdentifier) {
    logger.info({ method }, "Waiting for counterparty sig");
    return;
  }

  // TODO: should inject validation to make sure that a withdrawal transfer
  // is properly signed before its been merged into your channel
  const commitment = new WithdrawCommitment(
    channelAddress,
    alice,
    bob,
    transfer.balance.to[0],
    assetId,
    withdrawalAmount.toString(),
    nonce,
    callTo,
    callData,
  );

  // Generate your signature on the withdrawal commitment
  const responderSignature = await signer.signMessage(commitment.hashToSign());
  await commitment.addSignatures(initiatorSignature, responderSignature);

  // Store the double signed commitment
  await store.saveWithdrawalCommitment(transferId, commitment.toJson());

  // Assume that only alice will try to submit the withdrawal to chain.
  // Alice may or may not charge a fee for this service, and both parties
  // are welcome to submit the commitment if the other party does not.

  // NOTE: if bob is the withdrawal creator and alice has charged a fee
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
    const withdrawalResponse = await chainService.sendWithdrawTx(channelState, await commitment.getSignedTransaction());

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
      logger.warn({ error: withdrawalResponse.getError()!.message, method }, "Failed to submit tx");
    }
  }

  // Resolve withdrawal from counterparty
  // See note above re: fees + injected validation
  const resolveRes = await vector.resolve({
    transferResolver: { responderSignature },
    transferId,
    channelAddress,
    meta: { transactionHash, ...(transfer.meta ?? {}) },
  });

  // Handle the error
  if (resolveRes.isError) {
    logger.error(
      { method, error: resolveRes.getError()!.message, transferId, channelAddress, transactionHash },
      "Failed to resolve",
    );
    return;
  }

  // Withdrawal successfully resolved
  logger.info({ method, amount: withdrawalAmount.toString(), assetId, fee }, "Withdrawal resolved");
};
