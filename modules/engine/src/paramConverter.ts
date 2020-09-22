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
} from "@connext/vector-types";
import { utils } from "ethers";

import { InvalidTransferType } from "./errors";

export function convertConditionalTransferParams<T extends ConditionalTransferType>(
  params: ConditionalTransferParams<T>,
  channel: FullChannelState,
): Result<CreateTransferParams, InvalidTransferType> {
  const { channelAddress, amount, assetId, recipient, routingId, details, timeout } = params;
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
      linkedHash: utils.soliditySha256(["bytes32"], [(details as LinkedTransferParams).preImage]),
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
  channel: FullChannelState,
): Result<ResolveTransferParams, InvalidTransferType> {
  throw new Error("implement convertResolveConditionParams");
}

export async function convertWithdrawParams(
  params: WithdrawParams,
  chainAddresses: ChainAddresses,
): Promise<CreateTransferParams> {
  throw new Error("implement convertWithdrawParams");

  // // TODO create withdraw commitment (need to add util for this)

  // // TODO hash the withdraw commitment

  // // TODO sign the withdraw commitment
  // const transferInitialState = {}; // TODO setup initial state with the above params

  // return {
  //   channelAddress: params.channelAddress,
  //   amount: params.amount,
  //   assetId: params.assetId,
  //   transferDefinition,
  //   transferInitialState,
  //   timeout: DEFAULT_TRANSFER_TIMEOUT,
  //   encodings: [WithdrawStateEncoding, WithdrawResolverEncoding],
  // };
}
