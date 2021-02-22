import { RouterConfigResponse, IBasicMessaging, Result, RouterError, MessagingError } from "@connext/vector-types";
import { NatsBasicMessagingService, MessagingConfig } from "@connext/vector-utils";
import pino, { BaseLogger } from "pino";
export interface IRouterMessagingService extends IBasicMessaging {
  // Specialized request/response methods
  respondToRouterConfigMessage(
    inbox: string,
    configData: Result<RouterConfigResponse, RouterError | MessagingError>,
  ): Promise<void>;
  onReceiveRouterConfigMessage(
    publicIdentifier: string,
    callback: (configRequest: Result<void, RouterError | MessagingError>, from: string, inbox: string) => void,
  ): Promise<void>;

  onReceiveTransferQuoteMessage(): Promise<void>;
  respondToTransferQuoteMessage(): Promise<void>;
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
    configData: Result<RouterConfigResponse, RouterError | MessagingError>,
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
}
