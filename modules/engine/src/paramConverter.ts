import {
  CreateTransferParams,
  ConditionalTransferType,
  ConditionalTransferParams,
  ResolveTransferParams,
  ChainAddresses,
  FullChannelState,
  ResolveConditionParams,
  LinkedTransferStateEncoding,
  LinkedTransferResolverEncoding,
  WithdrawParams,
  LinkedTransferParams,
  LinkedTransferState,
  Result,
  DEFAULT_TRANSFER_TIMEOUT,
  FullTransferState,
  LinkedTransferResolver,
  WithdrawState,
  WithdrawStateEncoding,
  WithdrawResolverEncoding,
  TransferParams,
} from "@connext/vector-types";
import { getRandomBytes32 } from "@connext/vector-utils";

import { BigNumber, utils } from "ethers";

import { InvalidTransferType } from "./errors";

export function convertConditionalTransferParams<T extends ConditionalTransferType>(
  params: ConditionalTransferParams<T>,
  channel: FullChannelState,
): Result<CreateTransferParams, InvalidTransferType> {
  const { channelAddress, amount, assetId, recipient, routingId, details, timeout } = params;

  // TODO IMPORTANT!!! -- This needs to be ordered correctly based on who is calling the transfer!!
  const participants = channel.participants;

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

export function convertResolveConditionParams<T extends ConditionalTransferType>(
  params: ResolveConditionParams<T>,
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
    meta: params.meta,
  };

  return Result.ok({
    channelAddress,
    transferId: transfer.transferId,
    transferResolver,
    meta,
  });
}

export function convertWithdrawParams(
  params: WithdrawParams,
  channel: FullChannelState,
): Result<CreateTransferParams, InvalidTransferType> {
  const { channelAddress, assetId, recipient, fee } = params;
  let amount = fee ? BigNumber.from(params.amount).add(fee).toString() : params.amount;

  // TODO create withdraw commitment (need to add util for this)

  // TODO hash the withdraw commitment
  let data: string = ""; // TODO

  // TODO sign the withdraw commitment

  let initiatorSignature: string = ""; // TODO!

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

export function convertTransferParams(
  params: TransferParams,
  channel: FullChannelState,
): Result<CreateTransferParams, InvalidTransferType> {
  const { channelAddress, amount, assetId, recipient } = params;

  const preImage = getRandomBytes32();
  const encryptedPreImage = ""; // TODO

  return convertConditionalTransferParams(
    {
      channelAddress,
      amount,
      assetId,
      // TODO: what happens if recipient is undefined? How do we want to handle redeemable transfers?
      recipient,
      conditionType: ConditionalTransferType.LinkedTransfer,
      routingId: getRandomBytes32(),
      details: {
        linkedHash: utils.soliditySha256(["bytes32"], [preImage]),
      },
      meta: {
        encryptedPreImage,
      },
    } as ConditionalTransferParams<"LinkedTransfer">,
    channel,
  );
}
