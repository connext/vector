import { ChannelUpdateEvent, CreateUpdateDetails, IChannelSigner, IMessagingService, IVectorProtocol, ProtocolEventName, UpdateType } from "@connext/vector-types";
import { getSignerAddressFromPublicIdentifier} from "@connext/vector-utils";

export async function setupListeners(vector: IVectorProtocol, messaging: IMessagingService, signer: IChannelSigner) {
    // Set up withdraw listener and handler
    vector.on(
        ProtocolEventName.CHANNEL_UPDATE_EVENT,
        (data) => handleWithdrawResolve(data),
        (data) => data.updatedChannelState.latestUpdate.type == UpdateType.create 
                    && (data.updatedChannelState.latestUpdate.details as CreateUpdateDetails).transferDefinition === data.updatedChannelState.networkContext.withdrawDefinition 
                    && getSignerAddressFromPublicIdentifier(data.updatedChannelState.latestUpdate.fromIdentifier) !== signer.address,
    );
    
}

async function handleWithdrawResolve(data: ChannelUpdateEvent): Promise<void> {
    console.log("Reached here!")
}