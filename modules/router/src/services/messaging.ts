import { RouterConfigResponse, IBasicMessaging } from "@connext/vector-types";
import { NatsBasicMessagingService } from "@connext/vector-utils";
import { BaseLogger } from "pino";

export interface IRouterMessagingService extends IBasicMessaging {
  // Specialized broadcast methods
  publishRouterConfig(config: RouterConfigResponse): Promise<void>;
  subscribeToRouterConfig(
    routerIdentifier: string,
    callback: (config: RouterConfigResponse) => Promise<void> | void,
  ): void;
}

export class NatsRouterMessagingService extends NatsBasicMessagingService implements IRouterMessagingService {
  publishRouterConfig(config: RouterConfigResponse): Promise<void> {
    throw new Error("Method not implemented.");
  }
  subscribeToRouterConfig(
    routerIdentifier: string,
    callback: (config: RouterConfigResponse) => void | Promise<void>,
  ): void {
    throw new Error("Method not implemented.");
  }
}

export const configureSubscriptions = async (
  routerPublicIdentifier: string,
  routerSignerAddress: string,
  messagingService: IRouterMessagingService,
  logger: BaseLogger,
): Promise<void> => {};
