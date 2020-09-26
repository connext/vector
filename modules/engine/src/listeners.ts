import { WithdrawCommitment } from "@connext/vector-contracts";
import {
  ChannelUpdateEvent,
  CreateUpdateDetails,
  EngineEvents,
  FullChannelState,
  IChannelSigner,
  IMessagingService,
  IVectorProtocol,
  ProtocolEventName,
  ResolveUpdateDetails,
  UpdateType,
  WithdrawalCreatedPayload,
  WithdrawState,
} from "@connext/vector-types";
import { BigNumber } from "ethers";
import Pino from "pino";

import { EngineEvtContainer } from "../src/";

export async function setupEngineListeners(
  evts: EngineEvtContainer,
  vector: IVectorProtocol,
  messaging: IMessagingService,
  signer: IChannelSigner,
  logger: Pino.BaseLogger = Pino(),
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
    event => handleConditionalTransferCreation(event, signer, vector, evts, logger),
    event => {
      const {
        updatedChannelState: {
          latestUpdate: { type, details },
          networkContext: { withdrawDefinition },
        },
      } = event;
      return (
        type === UpdateType.create &&
        !!withdrawDefinition &&
        (details as CreateUpdateDetails).transferDefinition !== withdrawDefinition
      );
    },
  );

  // Setup listener for conditional transfer resolutions
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    event => handleConditionalTransferResolution(event, signer, vector, evts, logger),
    event => {
      const {
        updatedChannelState: {
          latestUpdate: { type, details },
          networkContext: { withdrawDefinition },
        },
      } = event;
      return (
        type === UpdateType.resolve &&
        !!withdrawDefinition &&
        (details as ResolveUpdateDetails).transferDefinition !== withdrawDefinition
      );
    },
  );

  // Set up listener for withdrawal transfer creations
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    event => handleWithdrawalTransferCreation(event, signer, vector, evts, logger),
    event => {
      const {
        updatedChannelState: {
          latestUpdate: { type, details },
          networkContext: { withdrawDefinition },
        },
      } = event;
      return (
        type === UpdateType.create &&
        !!withdrawDefinition &&
        (details as CreateUpdateDetails).transferDefinition === withdrawDefinition
      );
    },
  );

  // Setup listener for withdrawal resolutions
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    event => handleWithdrawalTransferResolution(event, signer, vector, evts, logger),
    event => {
      const {
        updatedChannelState: {
          latestUpdate: { type, details },
          networkContext: { withdrawDefinition },
        },
      } = event;
      return (
        type === UpdateType.resolve &&
        !!withdrawDefinition &&
        (details as ResolveUpdateDetails).transferDefinition === withdrawDefinition
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
  // Emit the properly structured event
  const {
    channelAddress,
    balances,
    assetIds,
    latestUpdate: { assetId },
  } = event.updatedChannelState;
}

async function handleConditionalTransferCreation(
  event: ChannelUpdateEvent,
  signer: IChannelSigner,
  vector: IVectorProtocol,
  evts: EngineEvtContainer,
  logger: Pino.BaseLogger,
): Promise<void> {
  // Emit the properly structured event
  // TODO: add automatic resolution for given transfer types
}

async function handleConditionalTransferResolution(
  event: ChannelUpdateEvent,
  signer: IChannelSigner,
  vector: IVectorProtocol,
  evts: EngineEvtContainer,
  logger: Pino.BaseLogger,
): Promise<void> {
  // Emit the properly structured event
}

async function handleWithdrawalTransferCreation(
  event: ChannelUpdateEvent,
  signer: IChannelSigner,
  vector: IVectorProtocol,
  evts: EngineEvtContainer,
  logger: Pino.BaseLogger,
): Promise<void> {
  // If you receive a withdrawal creation, you should
  // resolve the withdrawal with your signature
  const {
    channelAddress,
    participants,
    balances,
    assetIds,
    latestUpdate: {
      details: { transferId, transferInitialState },
      assetId,
      fromIdentifier,
    },
  } = event.updatedChannelState as FullChannelState<typeof UpdateType.create>;

  // Get the recipient + amount from the transfer state
  const { balance, nonce } = transferInitialState as WithdrawState;

  // TODO: properly account for fees?
  const withdrawalAmount = balance.amount.reduce((prev, curr) => prev.add(curr), BigNumber.from(0));

  // Post to evt
  const assetIdx = assetIds.findIndex(a => a === assetId);
  const payload: WithdrawalCreatedPayload = {
    assetId,
    amount: withdrawalAmount.toString(),
    recipient: balance.to[0],
    channelBalance: balances[assetIdx],
    channelAddress,
  };
  evts[EngineEvents.WITHDRAWAL_CREATED].post(payload);

  // If it is not from counterparty, do not respond
  if (fromIdentifier === signer.publicIdentifier) {
    logger.info(
      {
        channelAddress,
        withdrawalAmount: withdrawalAmount.toString(),
        assetId,
        transferId,
      },
      "Waiting for counterparty sig on withdrawal",
    );
  }

  // TODO: should inject validation to make sure that a withdrawal transfer
  // is properly signed before its been merged into your channel
  const commitment = new WithdrawCommitment(
    channelAddress,
    participants,
    balance.to[0], // TODO: correct recipient
    assetId,
    withdrawalAmount.toString(),
    nonce,
  );

  // Generate your signature on the withdrawal commitment
  const responderSignature = await signer.signMessage(commitment.hashToSign());

  // Resolve the withdrawal
  const resolveRes = await vector.resolve({ transferResolver: { responderSignature }, transferId, channelAddress });

  // Handle the error
  if (resolveRes.isError) {
    logger.error(
      { method: "handleWithdrawResolve", error: resolveRes.getError()!.message, transferId, channelAddress },
      "Failed to resolve withdrawal",
    );
  }

  // Withdrawal successfully resolved
  logger.info({ channelAddress, amount: withdrawalAmount.toString(), assetId, transferId }, "Withdrawal resolved");
}

async function handleWithdrawalTransferResolution(
  event: ChannelUpdateEvent,
  signer: IChannelSigner,
  vector: IVectorProtocol,
  evts: EngineEvtContainer,
  logger: Pino.BaseLogger = Pino(),
): Promise<void> {}

async function handleWithdrawalReconciliation(
  event: ChannelUpdateEvent,
  signer: IChannelSigner,
  vector: IVectorProtocol,
  logger: Pino.BaseLogger = Pino(),
): Promise<void> {}
