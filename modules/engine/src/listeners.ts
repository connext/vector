import {
  ChannelUpdateEvent,
  CreateUpdateDetails,
  IChannelSigner,
  IMessagingService,
  IVectorProtocol,
  ProtocolEventName,
  UpdateType,
} from "@connext/vector-types";

export async function setupListeners(
  vector: IVectorProtocol,
  messaging: IMessagingService,
  signer: IChannelSigner,
): Promise<void> {
  // Set up withdraw listener and handler
  vector.on(
    ProtocolEventName.CHANNEL_UPDATE_EVENT,
    data => handleWithdrawResolve(data),
    data => {
      const {
        updatedChannelState: {
          latestUpdate: { toIdentifier, type, details },
          networkContext: { withdrawDefinition },
        },
      } = data;
      return (
        toIdentifier === signer.publicIdentifier &&
        type === UpdateType.create &&
        (details as CreateUpdateDetails).transferDefinition === withdrawDefinition
      );
    },
  );
}

async function handleWithdrawResolve(data: ChannelUpdateEvent): Promise<void> {
  console.log("Reached here!");
}
