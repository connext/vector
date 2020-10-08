import { NatsService } from './nats';
import { NatsWebsocketService } from './natsws';

const natsServiceTypeNats = 'nats';
const natsServiceTypeWebsocket = 'ws';

export const natsPayloadTypeJson = 'json';
export const natsPayloadTypeBinary = 'binary';

export interface ILogger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export interface INatsService {
  connect(): Promise<any>;
  disconnect(): Promise<void>;
  getSubscribedSubjects(): string[];
  isConnected(): boolean;
  publish(subject: string, payload: any, reply?: string): Promise<void>;
  publishCount(): number;
  request(subject: string, timeout: number, data?: any): Promise<any | void>;
  subscribe(subject: string, callback: (msg: any, err?: any) => void): Promise<INatsSubscription>;
  unsubscribe(subject: string);
  flush(): Promise<void>;
}

export interface INatsStreamingService {
  attemptNack(conn: any, msg: any, timeout: number);
  nack(conn: any, msg: any);
  shouldDeadletter(msg: any, deadletterTimeout: number): boolean;
}

export interface INatsSubscription {
  unsubscribe();
}

export function natsServiceFactory(config: any, log?: ILogger): INatsService {
  const { natsServers, bearerToken, token } = config;
  if (!natsServers) {
    throw new Error('No NATS servers or websocket endpoints provided; check config');
  }

  let serviceType;

  if (typeof natsServers === 'string') {
    if (natsServers.startsWith('nats://')) {
      serviceType = natsServiceTypeNats;
    } else if (natsServers.startsWith('ws://') || natsServers.startsWith('wss://')) {
      serviceType = natsServiceTypeWebsocket;
    }
  } else if (natsServers.length > 0 && natsServers[0] && natsServers[0].startsWith('nats://')) {
    serviceType = natsServiceTypeNats;
  } else if (natsServers.length > 0 && natsServers[0] && natsServers[0].startsWith('ws://') || natsServers[0].startsWith('wss://')) {
    serviceType = natsServiceTypeWebsocket;
  }

  if (serviceType === natsServiceTypeNats) {
    return new NatsService(
      log,
      natsServers,
      bearerToken,
      token,
    );
  } else if (serviceType === natsServiceTypeWebsocket) {
    return new NatsWebsocketService(
      log,
      natsServers,
      bearerToken,
      token,
    );
  }

  throw new Error('Invalid NATS config; unable to resolve protocol; check config');
}
