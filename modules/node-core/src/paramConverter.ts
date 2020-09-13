import {
  CreateTransferParams,
  ResolveTransferParams,
  ChainAddresses,
  ConditionalTransferParams,
  ResolveConditionParams,
  WithdrawParams,
} from "@connext/vector-types";

export async function convertConditionalTransferParams(
  params: ConditionalTransferParams,
  chainAddresses: ChainAddresses,
): Promise<CreateTransferParams> {
  throw new Error("implement convertConditionalTransferParams");
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
