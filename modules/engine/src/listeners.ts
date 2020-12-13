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
  OutboundChannelUpdateError,
  Result,
  ChainError,
  MessagingError,
} from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import Pino from "pino";

import { EngineError } from "./errors";

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
  ) => Promise<
    Result<ChannelRpcMethodsResponsesMap[typeof ChannelRpcMethods.chan_setup], OutboundChannelUpdateError | Error>
  >,
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
      msg: Result<{ chainId: number } | { channelAddress: string; activeTransferIds: string[] }, MessagingError>,
      from: string,
      inbox: string,
    ) => {
      const method = "onReceiveRestoreStateMessage";
      logger.debug({ method }, "Handling message");

      // If it is from yourself, do nothing
      if (from === signer.publicIdentifier) {
        return;
      }

      if (msg.isError) {
        // FIXME: handle this better, when would you get an error result from
        // your counterparty?
        // releasing the lock should be done regardless of error
        const error = msg.getError()!;
        logger.error({ message: error.message, method, context: error.context }, "Error received");
        return;
      }

      const data = msg.getValue();
      const fields = Object.keys(data);
      const isRestoreConfirmation = fields.sort().join() === ["channelAddress", "activeTransferIds"].sort().join();
      if (!fields.includes("chainId") && !isRestoreConfirmation) {
        logger.error({ fields }, "Message malformed");
        return;
      }

      if (isRestoreConfirmation) {
        const { channelAddress } = data as any;
        const channel = await store.getChannelState(channelAddress);
        if (!channel) {
          logger.error({ channelAddress, data }, "Failed to find channel to release lock");
          return;
        }
        // Release the lock
        const releaseRes = await releaseRestoreLocks(channel!);
        if (releaseRes.isError) {
          logger.error({ ...releaseRes.getError()! }, "Failed to release lock");
        }
        return;
      }

      // Otherwise, they are looking to initiate a sync
      const sendCannotSyncFromError = (error: string, context: any = {}) => {
        return messaging.respondToRestoreStateMessage(
          inbox,
          Result.fail(new MessagingError(error as any, { ...context, method })),
        );
      };

      // Get info from store to send to counterparty
      const { chainId } = data as any;
      let channel: FullChannelState | undefined;
      try {
        channel = await store.getChannelStateByParticipants(signer.publicIdentifier, from, chainId);
      } catch (e) {
        return sendCannotSyncFromError("Store method failed", {
          storeMethod: "getChannelStateByParticipants",
          chainId,
          identifiers: [signer.publicIdentifier, from],
        });
      }
      if (!channel) {
        return sendCannotSyncFromError("No channel to restore from", { chainId });
      }
      let activeTransfers: FullTransferState[];
      try {
        activeTransfers = await store.getActiveTransfers(channel.channelAddress);
      } catch (e) {
        return sendCannotSyncFromError("Store method failed", {
          storeMethod: "getActiveTransfers",
          chainId,
          channelAddress: channel.channelAddress,
        });
      }

      // Acquire lock
      const res = await acquireRestoreLocks(channel);
      if (res.isError) {
        return sendCannotSyncFromError("Failed to acquire lock", {
          ...(res.getError()?.context ?? {}),
          channel: channel.channelAddress,
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

      // Release lock on timeout
      setTimeout(() => releaseRestoreLocks(channel!), 15_000);
    },
  );

  await messaging.onReceiveRequestCollateralMessage(signer.publicIdentifier, async (params, from, inbox) => {
    const method = "onReceiveRequestCollateralMessage";
    if (params.isError) {
      logger.error({ error: params.getError()?.message, method }, "Error received");
      return;
    }
    logger.info({ params: params.getValue(), method }, "Handling message");

    evts[REQUEST_COLLATERAL_EVENT].post({
      ...params.getValue(),
      aliceIdentifier: signer.publicIdentifier,
      bobIdentifier: from,
    });

    await messaging.respondToRequestCollateralMessage(inbox, { message: "Successfully requested collateral" });
  });

  await messaging.onReceiveSetupMessage(signer.publicIdentifier, async (params, from, inbox) => {
    const method = "onReceiveSetupMessage";
    if (params.isError) {
      logger.error({ error: params.getError()?.message, method }, "Error received");
    }
    const setupInfo = params.getValue();
    logger.info({ params: setupInfo, method }, "Handling message");
    let payload: { message?: string | undefined; error?: any };
    const res = await setup({
      chainId: setupInfo.chainId,
      counterpartyIdentifier: from,
      timeout: setupInfo.timeout,
    });
    if (res.isError) {
      payload = { error: res.getError()?.message };
    } else {
      payload = { message: res.getValue().channelAddress };
    }
    await messaging.respondToSetupMessage(inbox, payload);
  });
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
  } = event.updatedChannelState as FullChannelState<typeof UpdateType.setup>;
  const payload: SetupPayload = {
    channelAddress,
    aliceIdentifier,
    bobIdentifier,
    chainId,
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
    latestUpdate: { assetId },
  } = event.updatedChannelState as FullChannelState<typeof UpdateType.deposit>;
  const payload: DepositReconciledPayload = {
    aliceIdentifier,
    bobIdentifier,
    channelAddress,
    assetId,
    channelBalance: balances[assetIds.findIndex((a) => a === assetId)],
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
  } = event.updatedChannelState as FullChannelState<typeof UpdateType.create>;
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
  } = event.updatedChannelState as FullChannelState<typeof UpdateType.resolve>;
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
      { method: "isWithdrawRes", ...isWithdrawRes.getError()!.context },
      "Failed to determine if transfer is withdrawal",
    );
    return;
  }
  if (!isWithdrawRes.getValue()) {
    return;
  }
  const method = "handleWithdrawalTransferCreation";
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
  } = event.updatedChannelState as FullChannelState<typeof UpdateType.create>;
  logger.info({ channelAddress, transferId, assetId, method }, "Started");

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
    const withdrawalResponse = await chainService.sendWithdrawTx(
      event.updatedChannelState,
      await commitment.getSignedTransaction(),
    );

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
    meta: { transactionHash },
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
  } = event.updatedChannelState as FullChannelState<typeof UpdateType.resolve>;
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
  logger.info({ method, transactionHash: receipt.transactionHash }, "Withdraw tx mined, completed");
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
