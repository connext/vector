import { IChannelSigner, IEngineStore, IMessagingService, IVectorChainService, Result } from "@connext/vector-types";
import { getParticipant } from "@connext/vector-utils";
import { BaseLogger } from "pino";

export async function sendIsAlive(
  mySigner: IChannelSigner,
  messaging: IMessagingService,
  store: IEngineStore,
  chainService: IVectorChainService,
  logger: BaseLogger,
): Promise<void> {
  const method = "sendIsAlive";
  const channels = await store.getChannelStates();
  const providers = chainService.getChainProviders();
  if (providers.isError) {
    logger.error({ ...providers.getError(), method }, "Error getting chain providers");
    return;
  }
  const supportedChains = Object.keys(providers.getValue()).map((chain) => parseInt(chain));
  logger.info({ method, numChannels: channels.length }, "Sending check-in messages");
  await Promise.all(
    channels.map(async (channel) => {
      if (!supportedChains.includes(channel.networkContext.chainId)) {
        logger.debug(
          { chainId: channel.networkContext.chainId, supportedChains, method, channelAddress: channel.channelAddress },
          "Channel chain not supported, skipping",
        );
        return;
      }
      const participant = getParticipant(channel, mySigner.publicIdentifier);
      if (!participant) {
        logger.error(
          { participant, alice: channel.aliceIdentifier, bob: channel.bobIdentifier, channel: channel.channelAddress },
          "Signer not in channel",
        );
        return;
      }
      const counterpartyIdentifier = participant === "alice" ? channel.bobIdentifier : channel.aliceIdentifier;
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
