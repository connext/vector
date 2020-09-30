import { WithdrawCommitment } from "@connext/vector-contracts";
import {
  ChainAddresses,
  ChannelUpdateEvent,
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  ConditionalTransferType,
  CreateUpdateDetails,
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
  TransferName,
  UpdateType,
  WithdrawalCreatedPayload,
  WithdrawalResolvedPayload,
  WithdrawState,
} from "@connext/vector-types";
import { BigNumber } from "ethers";
import Pino from "pino";

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
): Promise<void> {
  // Setup listener for deposit reconciliations
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    event => handleDepositReconciliation(event, signer, vector, evts, logger),
    event => {
      const {
        updatedChannelState: {
          latestUpdate: { type },
        },
      } = event;
      return type === UpdateType.deposit;
    },
  );

  // Setup listener for conditional transfer creations
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    event => handleConditionalTransferCreation(event, signer, vector, store, chainAddresses, evts, logger),
    event => {
      const {
        updatedChannelState: {
          latestUpdate: { type, details },
          networkContext: { chainId },
        },
      } = event;
      return (
        type === UpdateType.create &&
        (details as CreateUpdateDetails).transferDefinition !== chainAddresses[chainId].withdrawDefinition
      );
    },
  );

  // Setup listener for conditional transfer resolutions
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    event => handleConditionalTransferResolution(event, chainAddresses, store, evts, logger),
    event => {
      const {
        updatedChannelState: {
          latestUpdate: { type, details },
          networkContext: { chainId },
        },
      } = event;
      return (
        type === UpdateType.resolve &&
        (details as ResolveUpdateDetails).transferDefinition !== chainAddresses[chainId].withdrawDefinition
      );
    },
  );

  // Set up listener for withdrawal transfer creations
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    event => handleWithdrawalTransferCreation(event, signer, vector, store, evts, chainService, logger),
    event => {
      const {
        updatedChannelState: {
          latestUpdate: { type, details },
          networkContext: { chainId },
        },
      } = event;
      return (
        type === UpdateType.create &&
        (details as CreateUpdateDetails).transferDefinition === chainAddresses[chainId].withdrawDefinition
      );
    },
  );

  // Setup listener for withdrawal resolutions
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    event => handleWithdrawalTransferResolution(event, signer, store, evts, chainService, logger),
    event => {
      const {
        updatedChannelState: {
          latestUpdate: { type, details },
          networkContext: { chainId },
        },
      } = event;
      return (
        type === UpdateType.resolve &&
        (details as ResolveUpdateDetails).transferDefinition === chainAddresses[chainId].withdrawDefinition
      );
    },
  );

  // TODO: how to monitor for withdrawal reconciliations (onchain tx submitted)
  // who will submit the transaction? should both engines watch the multisig
  // indefinitely?
}

async function handleDepositReconciliation(
  event: ChannelUpdateEvent,
  signer: IChannelSigner,
  vector: IVectorProtocol,
  evts: EngineEvtContainer,
  logger: Pino.BaseLogger,
): Promise<void> {
  logger.info({ channelAddress: event.updatedChannelState.channelAddress }, "Handling deposit reconciliation event");
  // Emit the properly structured event
  const {
    channelAddress,
    balances,
    assetIds,
    latestUpdate: { assetId },
  } = event.updatedChannelState as FullChannelState<typeof UpdateType.deposit>;
  const payload: DepositReconciledPayload = {
    channelAddress,
    assetId,
    channelBalance: balances[assetIds.findIndex(a => a === assetId)],
  };
  evts[EngineEvents.DEPOSIT_RECONCILED].post(payload);
}

async function handleConditionalTransferCreation(
  event: ChannelUpdateEvent,
  signer: IChannelSigner,
  vector: IVectorProtocol,
  store: IEngineStore,
  chainAddresses: ChainAddresses,
  evts: EngineEvtContainer,
  logger: Pino.BaseLogger,
): Promise<void> {
  const {
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
  // TODO: consider a store method to find active transfer by routingId
  const transfer = await store.getTransferState(transferId);
  if (!transfer) {
    logger.warn({ transferId }, "Transfer not found after creation");
    return;
  }

  let conditionType: ConditionalTransferType | undefined;
  switch (transferDefinition) {
    case chainAddresses[chainId].linkedTransferDefinition:
      conditionType = ConditionalTransferType.LinkedTransfer;
      break;
  }

  const assetIdx = assetIds.findIndex(a => a === assetId);
  const payload: ConditionalTransferCreatedPayload = {
    channelAddress,
    channelBalance: balances[assetIdx],
    transfer,
    conditionType: conditionType!,
  };
  evts[EngineEvents.CONDITIONAL_TRANSFER_CREATED].post(payload);

  // If we should not route the transfer, do nothing
  if (!routingId || transfer.meta.routingId !== routingId) {
    logger.warn({ transferId, routingId, meta: transfer.meta }, "Cannot route transfer");
    return;
  }

  // TODO: add automatic resolution for given transfer types
}

async function handleConditionalTransferResolution(
  event: ChannelUpdateEvent,
  chainAddresses: ChainAddresses,
  store: IEngineStore,
  evts: EngineEvtContainer,
  logger: Pino.BaseLogger,
): Promise<void> {
  logger.info(
    { channelAddress: event.updatedChannelState.channelAddress },
    "Handling conditional transfer resolve event",
  );
  const {
    channelAddress,
    assetIds,
    balances,
    networkContext: { chainId },
    latestUpdate: {
      assetId,
      details: { transferId, meta, transferDefinition },
    },
  } = event.updatedChannelState as FullChannelState<typeof UpdateType.resolve>;
  // Emit the properly structured event
  let conditionType: ConditionalTransferType | undefined;
  switch (transferDefinition) {
    case chainAddresses[chainId].linkedTransferDefinition:
      conditionType = ConditionalTransferType.LinkedTransfer;
      break;
  }
  const transfer = await store.getTransferState(transferId);
  const payload: ConditionalTransferResolvedPayload = {
    channelAddress,
    channelBalance: balances[assetIds.findIndex(a => a === assetId)],
    transfer: transfer!,
    conditionType: conditionType!,
  };
  evts[EngineEvents.CONDITIONAL_TRANSFER_RESOLVED].post(payload);
}

async function handleWithdrawalTransferCreation(
  event: ChannelUpdateEvent,
  signer: IChannelSigner,
  vector: IVectorProtocol,
  store: IEngineStore,
  evts: EngineEvtContainer,
  chainService: IVectorChainService,
  logger: Pino.BaseLogger,
): Promise<void> {
  const method = "handleWithdrawalTransferCreation";
  // If you receive a withdrawal creation, you should
  // resolve the withdrawal with your signature
  const {
    channelAddress,
    balances,
    assetIds,
    alice,
    latestUpdate: {
      details: { transferId, transferInitialState },
      assetId,
      fromIdentifier,
    },
  } = event.updatedChannelState as FullChannelState<typeof UpdateType.create>;
  logger.info({ channelAddress, transferId, assetId, method }, "Started");

  // Get the recipient + amount from the transfer state
  const transfer = (await store.getTransferState(transferId))!;
  const { balance, nonce, initiatorSignature, fee, initiator, responder } = transferInitialState as WithdrawState;

  const withdrawalAmount = balance.amount.reduce((prev, curr) => prev.add(curr), BigNumber.from(0)).sub(fee);
  logger.debug({ withdrawalAmount: withdrawalAmount.toString(), initiator, responder, fee }, "Withdrawal info");

  // Post to evt
  const assetIdx = assetIds.findIndex(a => a === assetId);
  const payload: WithdrawalCreatedPayload = {
    assetId,
    amount: withdrawalAmount.toString(),
    fee,
    recipient: balance.to[0],
    channelBalance: balances[assetIdx],
    channelAddress,
    transfer,
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
    initiator,
    responder,
    balance.to[0],
    assetId,
    withdrawalAmount.toString(),
    nonce,
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
    meta: { ...(transfer.meta ?? {}), transactionHash },
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
  chainService: IVectorChainService,
  logger: Pino.BaseLogger = Pino(),
): Promise<void> {
  const method = "handleWithdrawalTransferResolution";

  const {
    channelAddress,
    balances,
    assetIds,
    alice,
    latestUpdate: {
      details: { transferId },
      assetId,
      fromIdentifier,
    },
  } = event.updatedChannelState as FullChannelState<typeof UpdateType.resolve>;
  logger.info({ method, channelAddress, transferId }, "Started");

  // Get the withdrawal amount
  const transfer = (await store.getTransferState(transferId)) as FullTransferState<typeof TransferName.Withdraw>;
  if (!transfer) {
    logger.warn({ method, transferId, channelAddress }, "Could not find transfer for withdrawal resolution");
    return;
  }

  const withdrawalAmount = transfer.initialBalance.amount
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
  const assetIdx = assetIds.findIndex(a => a === assetId);
  const payload: WithdrawalResolvedPayload = {
    assetId,
    amount: withdrawalAmount.toString(),
    fee: transfer.transferState.fee,
    recipient: transfer.initialBalance.to[0],
    channelBalance: balances[assetIdx],
    channelAddress,
    transfer,
  };
  evts[EngineEvents.WITHDRAWAL_RESOLVED].post(payload);

  // If it is not from counterparty, do not respond
  if (fromIdentifier === signer.publicIdentifier) {
    logger.info({ method, withdrawalAmount: withdrawalAmount.toString(), assetId }, "Completed");
    return;
  }

  // Generate our own commitment, and save the double signed version
  const commitment = new WithdrawCommitment(
    channelAddress,
    transfer.initiator,
    transfer.responder,
    transfer.initialBalance.to[0],
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
  if (signer.address !== alice) {
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
  logger.info({ transactionHash: tx.hash }, "Submitted withdraw tx");
  const receipt = await tx.wait();
  logger.info({ method, transactionHash: receipt.transactionHash }, "Withdraw tx mined, completed");
}
