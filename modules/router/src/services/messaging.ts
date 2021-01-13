import { RouterConfigResponse } from "@connext/vector-types";

export interface IRouterMessagingService {
  // Standard messaging service methods
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(subject: string, data: any): Promise<void>;
  subscribe(subject: string, cb: (data: any) => any): Promise<void>;
  unsubscribe(subject: string): Promise<void>;
  flush(): Promise<void>;
  request(subject: string, timeout: number, data: any): Promise<any>;

  // Specialized broadcast methods
  publishRouterConfig(config: RouterConfigResponse): Promise<void>;
  subscribeToRouterConfig(
    routerIdentifier: string,
    callback: (config: RouterConfigResponse) => Promise<void> | void,
  ): void;
}

export class NatsRouterMessagingService implements IRouterMessagingService {
  connect(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  disconnect(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  publish(subject: string, data: any): Promise<void> {
    throw new Error("Method not implemented.");
  }
  subscribe(subject: string, cb: (data: any) => any): Promise<void> {
    throw new Error("Method not implemented.");
  }
  unsubscribe(subject: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
  flush(): Promise<void> {
    throw new Error("Method not implemented.");
  }
  request(subject: string, timeout: number, data: any): Promise<any> {
    throw new Error("Method not implemented.");
  }
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
