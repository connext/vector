import { WithdrawCommitment } from "@connext/vector-contracts";
import { getRandomBytes32 } from "@connext/vector-utils";
import {
  CreateTransferParams,
  ConditionalTransferType,
  ResolveTransferParams,
  FullChannelState,
  LinkedTransferStateEncoding,
  LinkedTransferResolverEncoding,
  LinkedTransferState,
  Result,
  DEFAULT_TRANSFER_TIMEOUT,
  FullTransferState,
  LinkedTransferResolver,
  WithdrawState,
  WithdrawStateEncoding,
  WithdrawResolverEncoding,
  EngineParams,
  IChannelSigner,
  ChainAddresses,
} from "@connext/vector-types";
import { BigNumber } from "ethers";

import { InvalidTransferType } from "./errors";

export function convertConditionalTransferParams(
  params: EngineParams.ConditionalTransfer,
  signer: IChannelSigner,
  channel: FullChannelState,
  chainAddresses: ChainAddresses,
): Result<CreateTransferParams, InvalidTransferType> {
  const { channelAddress, amount, assetId, recipient, routingId, details, timeout } = params;

  const signers =
    channel.participants[0] == signer.address
      ? channel.participants
      : [channel.participants[1], channel.participants[0]];
  const recipientChainId = params.recipientChainId ? params.recipientChainId : channel.networkContext.chainId;
  const recipientAssetId = params.recipientAssetId ? params.recipientAssetId : params.assetId;

  let transferDefinition: string | undefined;
  let transferInitialState: LinkedTransferState;
  let encodings: string[];

  if (params.conditionType === ConditionalTransferType.LinkedTransfer) {
    transferDefinition = chainAddresses[channel.networkContext.chainId].linkedTransferDefinition;
    transferInitialState = {
      balance: {
        amount: [amount, "0"],
        to: signers,
      },
      linkedHash: details.linkedHash,
    };
    encodings = [LinkedTransferStateEncoding, LinkedTransferResolverEncoding];
  } else {
    return Result.fail(new InvalidTransferType(params.conditionType));
  }

  // TODO: enforce that passed in meta is an object
  const meta = {
    routingId: routingId ?? getRandomBytes32(),
    path: [{ recipient, recipientChainId, recipientAssetId }],
    ...params.meta,
  };

  return Result.ok({
    channelAddress,
    amount,
    assetId,
    signers,
    transferDefinition: transferDefinition!,
    transferInitialState,
    timeout: timeout || DEFAULT_TRANSFER_TIMEOUT.toString(),
    encodings,
    meta,
  });
}

export function convertResolveConditionParams(
  params: EngineParams.ResolveTransfer,
  transfer: FullTransferState,
): Result<ResolveTransferParams, InvalidTransferType> {
  const { channelAddress, routingId, details, meta } = params;
  let transferResolver: LinkedTransferResolver;

  if (params.conditionType == ConditionalTransferType.LinkedTransfer) {
    transferResolver = {
      preImage: details.preImage,
    };
  } else {
    return Result.fail(new InvalidTransferType(params.conditionType));
  }

  return Result.ok({
    channelAddress,
    transferId: transfer.transferId,
    transferResolver,
    meta: { details: meta ?? {}, routingId },
  });
}

export async function convertWithdrawParams(
  params: EngineParams.Withdraw,
  signer: IChannelSigner,
  channel: FullChannelState,
): Promise<Result<CreateTransferParams, InvalidTransferType>> {
  const { channelAddress, assetId, recipient, fee } = params;

  // If there is a fee being charged, add the fee to the amount.
  const amount = fee
    ? BigNumber.from(params.amount)
        .add(fee)
        .toString()
    : params.amount;

  const commitment = new WithdrawCommitment(
    channel.channelAddress,
    channel.participants,
    params.recipient,
    assetId,
    // Important: Use params.amount here which doesn't include fee!!
    params.amount,
    // Use channel nonce as a way to keep withdraw hashes unique
    channel.nonce.toString(),
  );

  const aliceSignature = await signer.signMessage(commitment.hashToSign());

  const counterpartySigner =
    channel.participants[0] == signer.address ? channel.participants[1] : channel.participants[0];

  const signers = [signer.address, counterpartySigner];

  const transferInitialState: WithdrawState = {
    balance: {
      amount: [amount, "0"],
      to: [recipient, counterpartySigner],
    },
    aliceSignature,
    signers,
    data: commitment.hashToSign(),
    nonce: channel.nonce.toString(),
    fee: fee ? fee : "0",
  };

  return Result.ok({
    channelAddress,
    amount,
    assetId,
    transferDefinition: channel.networkContext.withdrawDefinition!,
    transferInitialState,
    timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
    encodings: [WithdrawStateEncoding, WithdrawResolverEncoding],
    signers,
    // Note: we MUST include withdrawNonce in meta. The counterparty will NOT have the same nonce on their end otherwise.
    meta: {
      withdrawNonce: channel.nonce.toString(),
    },
  });
}
