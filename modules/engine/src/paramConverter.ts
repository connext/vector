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
} from "@connext/vector-types";
import { BigNumber } from "ethers";

import { InvalidTransferType } from "./errors";

export function convertConditionalTransferParams(
  params: EngineParams.ConditionalTransfer,
  signer: IChannelSigner,
  channel: FullChannelState,
): Result<CreateTransferParams, InvalidTransferType> {
  const { channelAddress, amount, assetId, recipient, routingId, details, timeout } = params;

  const participants = channel.participants[0] == signer.address ? channel.participants : [channel.participants[1], channel.participants[0]];
  const recipientChainId = params.recipientChainId ? params.recipientChainId : channel.networkContext.chainId;
  const recipientAssetId = params.recipientAssetId ? params.recipientAssetId : params.assetId;

  let transferDefinition: string | undefined;
  let transferInitialState: LinkedTransferState;
  let encodings: string[];

  if (params.conditionType === ConditionalTransferType.LinkedTransfer) {
    transferDefinition = channel.networkContext.linkedTransferDefinition;
    transferInitialState = {
      balance: {
        amount: [amount, "0"],
        to: participants,
      },
      linkedHash: details.linkedHash,
    };
    encodings = [LinkedTransferStateEncoding, LinkedTransferResolverEncoding];
  } else {
    return Result.fail(new InvalidTransferType(params.conditionType));
  }

  const meta = {
    recipient,
    recipientChainId,
    recipientAssetId,
    routingId,
    meta: params.meta,
  };

  return Result.ok({
    channelAddress,
    amount,
    assetId,
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
  const { channelAddress, routingId, details } = params;
  let transferResolver: LinkedTransferResolver;

  if (params.conditionType == ConditionalTransferType.LinkedTransfer) {
    transferResolver = {
      preImage: details.preImage,
    };
  } else {
    return Result.fail(new InvalidTransferType(params.conditionType));
  }

  const meta = {
    routingId,
    meta: params.meta
  };

  return Result.ok({
    channelAddress,
    transferId: transfer.transferId,
    transferResolver,
    meta,
  });
}

export function convertWithdrawParams(
  params: EngineParams.Withdraw,
  signer: IChannelSigner,
  channel: FullChannelState,
): Result<CreateTransferParams, InvalidTransferType> {
  const { channelAddress, assetId, recipient, fee } = params;
  const amount = fee ? BigNumber.from(params.amount).add(fee).toString() : params.amount;

  // TODO create withdraw commitment (need to add util for this)

  // TODO hash the withdraw commitment
  const data = ""; // TODO

  // TODO sign the withdraw commitment

  const initiatorSignature = ""; // TODO!

  const counterpartySigner = channel.participants[0] == signer.address ? channel.participants[1] : channel.participants[0];

  const transferInitialState: WithdrawState = {
    balance: {
      amount: [amount, "0"],
      // TODO we need to figure out if to[1] is participant[0] or participant[1]!!!
      to: [recipient, channel.participants[1]],
    },
    initiatorSignature,
    // TODO ordering!!
    signers: channel.participants,
    data,
    nonce: "1", // TODO -- how do we do this?
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
  });
}
