import { IBasicMessaging, Result, RouterError, MessagingError, NodeResponses, NodeParams } from "@connext/vector-types";
import { NatsBasicMessagingService, MessagingConfig } from "@connext/vector-utils";
import pino, { BaseLogger } from "pino";
export interface IRouterMessagingService extends IBasicMessaging {
  // Specialized request/response methods
  respondToRouterConfigMessage(
    inbox: string,
    configData: Result<NodeResponses.GetRouterConfig, RouterError | MessagingError>,
  ): Promise<void>;
  onReceiveRouterConfigMessage(
    publicIdentifier: string,
    callback: (configRequest: Result<void, RouterError | MessagingError>, from: string, inbox: string) => void,
  ): Promise<void>;

  onReceiveTransferQuoteMessage(
    publicIdentifier: string,
    callback: (
      quoteRequest: Result<Omit<NodeParams.TransferQuote, "routerIdentifier">, RouterError | MessagingError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void>;
  respondToTransferQuoteMessage(
    inbox: string,
    response: Result<NodeResponses.TransferQuote, RouterError | MessagingError>,
  ): Promise<void>;

  broadcastMetrics(publicIdentifier: string, metrics: string): Promise<void>;
}

export class NatsRouterMessagingService extends NatsBasicMessagingService implements IRouterMessagingService {
  private logger: BaseLogger;
  constructor(private readonly config: MessagingConfig) {
    super(config);
    this.logger = config.logger ?? pino();
  }

  // Config messages
  respondToRouterConfigMessage(
    inbox: string,
    configData: Result<NodeResponses.GetRouterConfig, RouterError | MessagingError>,
  ): Promise<void> {
    return this.respondToMessage(inbox, configData, "respondToRouterConfigMessage");
  }

  async onReceiveRouterConfigMessage(
    publicIdentifier: string,
    callback: (configRequest: Result<void, RouterError | MessagingError>, from: string, inbox: string) => void,
  ): Promise<void> {
    await this.registerCallback(`${publicIdentifier}.*.config`, callback, "onReceiveRouterConfigMessage");
  }
  //////////////////

  // Transfer Quote messages
  respondToTransferQuoteMessage(
    inbox: string,
    response: Result<NodeResponses.TransferQuote, RouterError | MessagingError>,
  ): Promise<void> {
    return this.respondToMessage(inbox, response, "respondToTransferQuoteMessage");
  }

  async onReceiveTransferQuoteMessage(
    publicIdentifier: string,
    callback: (
      quoteRequest: Result<NodeParams.TransferQuote, RouterError | MessagingError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void> {
    await this.registerCallback(`${publicIdentifier}.*.transfer-quote`, callback, "onReceiveTransferQuoteMessage");
  }

  async broadcastMetrics(publicIdentifier: string, metrics: string): Promise<void> {
    await this.publish(`${publicIdentifier}.${publicIdentifier}.metrics`, metrics);
  }
}
