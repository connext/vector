import { RouterConfigResponse, IBasicMessaging, Result } from "@connext/vector-types";
import { getRandomBytes32, NatsBasicMessagingService, MessagingConfig } from "@connext/vector-utils";
import pino, { BaseLogger } from "pino";

import { config } from "../config";

export interface IRouterMessagingService extends IBasicMessaging {
  // Specialized broadcast methods
  publishRouterConfig(config: RouterConfigResponse): Promise<void>;
}

export class NatsRouterMessagingService extends NatsBasicMessagingService implements IRouterMessagingService {
  private logger: BaseLogger;
  constructor(private readonly messagingConfig: MessagingConfig) {
    super(messagingConfig);
    this.logger = messagingConfig.logger ?? pino();
  }

  async publishRouterConfig(config: RouterConfigResponse): Promise<void> {
    const method = "publishRouterConfig";
    const methodId = getRandomBytes32();
    this.logger.debug({ method, methodId, config }, "Method started");
    const subject = `${this.publicIdentifier}.config`;
    await this.publish(subject, Result.ok(config).toJson());
    this.logger.debug({ method, methodId }, "Method complete");
  }
}

export const configureSubscriptions = async (
  messagingService: IRouterMessagingService,
  logger: BaseLogger,
): Promise<void> => {
  const method = "configureSubscriptions";
  const methodId = getRandomBytes32();
  logger.debug({ method, methodId }, "Method started");
  const { chainProviders, allowedSwaps } = config;
  const supportedChains = Object.keys(chainProviders).map(parseInt);
  await messagingService.publishRouterConfig({ supportedChains, allowedSwaps });
  logger.debug({ method, methodId }, "Method complete");
};
