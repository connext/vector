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
} from "@connext/vector-types";
import { utils } from "ethers";

import { DEFAULT_TRANSFER_TIMEOUT } from "./constants";

export async function convertConditionalTransferParams<T extends ConditionalTransferType>(
  params: ConditionalTransferParams<T>,
  chainAddresses: ChainAddresses,
  channel: FullChannelState,
): Promise<CreateTransferParams> {
  const { channelAddress, amount, assetId, recipient, paymentId, details } = params;
  const chainId = channel.networkContext.chainId;
  const participants = channel.participants;
  let transferDefinition;
  let transferInitialState;
  let encodings;

  if (params.conditionType === ConditionalTransferType.LinkedTransfer) {
    transferDefinition = chainAddresses[chainId].linkedTransferDefinition;
    transferInitialState = {
      balance: {
        amount: [amount, 0],
        to: participants,
      },
      linkedHash: utils.soliditySha256(["bytes32"], [(details as LinkedTransferParams).preImage]),
    };
    encodings = [LinkedTransferStateEncoding, LinkedTransferResolverEncoding];
  }

  const meta = {
    recipient,
    paymentId,
    meta: params.meta,
  };

  return {
    channelAddress,
    amount,
    assetId,
    transferDefinition,
    transferInitialState,
    timeout: DEFAULT_TRANSFER_TIMEOUT,
    encodings,
    meta,
  };
}

export async function convertResolveConditionParams(params: ResolveConditionParams): Promise<ResolveTransferParams> {
  throw new Error("implement convertResolveConditionParams");
}

export async function convertWithdrawParams(
  params: WithdrawParams,
  chainAddresses: ChainAddresses,
): Promise<CreateTransferParams> {
  throw new Error("implement convertWithdrawParams");
  // const transferDefinition = ""; // TODO get from chainAddresses and channel state

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
