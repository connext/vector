import { CreateTransferParams, ResolveTransferParams, WithdrawStateEncoding, WithdrawResolverEncoding, ChainAddresses, ChainProviders, DEFAULT_TRANSFER_TIMEOUT} from "@connext/vector-types";

export async function convertConditionalTransferParams(params: ConditionalTransferParams, chainAddresses: ChainAddresses, chainProviders: ChainProviders): Promise<CreateTransferParams> {
    return {}
}

export async function convertResolveConditionParams(params: ResolveConditionParams): Promise<ResolveTransferParams> {
    return {}
}

export async function convertWithdrawParams(params: WithdrawParams, chainAddresses: ChainAddresses, chainProviders: ChainProviders): Promise<CreateTransferParams> {
    const transferDefinition = "" // TODO get from chainAddresses and chainProviders

    // TODO create withdraw commitment (need to add util for this)

    // TODO hash the withdraw commitment

    // TODO sign the withdraw commitment

    const transferInitialState = {} // TODO setup initial state with the above params

    return {
        channelAddress: params.channelAddress,
        amount: params.amount,
        assetId: params.assetId,
        transferDefinition,
        transferInitialState,
        timeout: DEFAULT_TRANSFER_TIMEOUT,
        encodings: [WithdrawStateEncoding, WithdrawResolverEncoding]
      };
}