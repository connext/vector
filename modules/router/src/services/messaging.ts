import { RouterConfigResponse, IBasicMessaging, Result, RouterError, MessagingError } from "@connext/vector-types";
import { NatsMetricsMessagingService, MessagingConfig } from "@connext/vector-utils";
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
}

export class NatsRouterMessagingService extends NatsMetricsMessagingService implements IRouterMessagingService {
  private routerLogger: BaseLogger;
  constructor(config: MessagingConfig) {
    super(config);
    this.routerLogger = config.logger ?? pino();
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
