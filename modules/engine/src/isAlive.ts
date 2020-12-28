import { IChannelSigner, IEngineStore, IMessagingService, Result } from "@connext/vector-types";
import { BaseLogger } from "pino";

export async function sendIsAlive(
  mySigner: IChannelSigner,
  messaging: IMessagingService,
  store: IEngineStore,
  logger: BaseLogger,
): Promise<void> {
  const method = "sendIsAlive";
  const channels = await store.getChannelStates();
  logger.info({ method, numChannels: channels.length }, "Sending check-in messages");
  await Promise.all(
    channels.map(async (channel) => {
      const counterpartyIdentifier =
        mySigner.publicIdentifier === channel.aliceIdentifier ? channel.bobIdentifier : channel.aliceIdentifier;
      const res = await messaging.sendIsAliveMessage(
        Result.ok({ channelAddress: channel.channelAddress }),
        counterpartyIdentifier,
        mySigner.publicIdentifier,
      );
      if (res.isError) {
        logger.error(
          {
            method,
            counterpartyIdentifier,
            channel: channel.channelAddress,
            error: res.getError()?.message,
            context: res.getError()?.context,
          },
          "Error sending checkIn message",
        );
      } else {
        logger.info(
          { method, counterpartyIdentifier, channel: channel.channelAddress, result: res.getValue() },
          "Successfully sent checkIn message",
        );
      }
    }),
  );
}
