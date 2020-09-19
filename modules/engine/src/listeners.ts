import { ChannelUpdateEvent, IMessagingService, IVectorProtocol, ProtocolEventName } from "@connext/vector-types";
    
export async function setupListeners(context: {vector: IVectorProtocol, messaging: IMessagingService}): Promise<void> {    // TODO types
    // Set up listeners for 
    context.vector.on(
      ProtocolEventName.CHANNEL_UPDATE_EVENT,
      (data: ChannelUpdateEvent) => {
        // TODO handle automatically resolving a linked transfer
        if (!data.updatedChannelState.latestUpdate?.details.meta.encryptedPreImage) {
        }
        // TODO handle automatically responding to a withdraw

      },
      (data) => data.updatedChannelState.latestUpdate?.details.meta.recipient === context.vector.publicIdentifier,
    );

    // TODO subscribe to deposit changes
    // await context.onchainTxService.subscribeDeposit(() => {
        // Filter for our deposit vs counterparty deposit

        // Attempt to send deposit protocol

        // If it fails because of timeout (no response), add to queue
    //})
}