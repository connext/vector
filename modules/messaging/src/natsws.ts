import * as natsws from '@provide/nats.ws';
import { Config } from './env';
import { ILogger, INatsService, INatsSubscription, natsPayloadTypeBinary, natsPayloadTypeJson } from '.';

const uuidv4 = require('uuid/v4');

export class NatsWebsocketService implements INatsService {

  private bearerToken: string | undefined | null;
  private config: Config;
  private connection?: natsws.Connection | null;
  private log?: ILogger;
  private pubCount = 0;
  private servers: string[];
  private subscriptions: { [key: string]: INatsSubscription } = {};
  private token?: string | undefined | null;

  constructor(
    log?: ILogger,
    servers?: string[],
    bearerToken?: string | undefined | null,
    token?: string | undefined | null
  ) {
    this.bearerToken = bearerToken;
    this.config = Config.fromEnv();
    this.log = log;
    this.servers = servers ? servers : (this.config.natsServers || '').split(',');
    this.token = token ? token : this.config.natsToken;
  }

  async connect(): Promise<any> {
    if (this.connection && !this.connection.isClosed()) {
      this.log?.debug('Attempted to establish NATS connection short-circuirted; connection is already open');
      return Promise.resolve(this.connection);
    }

    return new Promise((resolve, reject) => {
      const clientId = `${this.config.natsClientPrefix}-${uuidv4()}`;
      natsws.connect({
        // connectTimeout: 1000,
        name: clientId,
        noEcho: this.config.natsNoEcho,
        pedantic: this.config.natsPedantic,
        token: this.token || undefined,
        url: this.servers[0],
        userJWT: this.bearerToken || undefined,
        verbose: this.config.natsVerbose,
      }).then((nc) => {
        this.connection = nc;

        nc.addEventListener('close', () => {
          this.log?.debug('Connection closed');
          this.connection = null;
        });

        nc.addEventListener('error', () => {
          if (nc.isClosed()) {
            this.log?.debug('Connection closed');
            this.connection = null;
          }
        });

        resolve(nc);
      }).catch((err) => {
        this.log?.debug(`Error establishing NATS connection: ${clientId}; ${err}"`);
        reject(err);
      });
    });
  }

  async disconnect(): Promise<void> {
    this.assertConnected();
    return new Promise((resolve, reject) => {
      this.flush().then(() => {
        this.connection?.drain();
        this.connection?.close();
        this.connection = null;
        resolve();
      }).catch((err) => {
        this.log?.debug(`NATS flush failed; ${err}`);
        reject(err);
      });
    });
  }

  getSubscribedSubjects(): string[] {
    return Object.keys(this.subscriptions);
  }

  isConnected(): boolean {
    return this.connection ? !this.connection.isClosed() : false;
  }

  async publish(subject: string, payload: any, reply?: string): Promise<void> {
    this.assertConnected();
    return new Promise((resolve) => {
      this.connection?.publish(subject, payload, reply);
      this.pubCount++;
      resolve();
    });
  }

  publishCount(): number {
    return this.pubCount;
  }

  async request(subject: string, timeout: number, data?: any): Promise<any> {
    this.assertConnected();
    return new Promise((resolve, reject) => {
      this.connection?.request(subject, timeout, data).then((msg) => {
        resolve(msg);
      }).catch((err) => {
        this.log?.debug(`NATS request failed; ${err}`);
        reject(err);
      });
    });
  }

  async subscribe(subject: string, callback: (msg: any, err?: any) => void): Promise<INatsSubscription> {
    this.assertConnected();
    return new Promise((resolve, reject) => {
      this.connection?.subscribe(subject, callback).then((sub: INatsSubscription) => {
        this.subscriptions[subject] = sub;
        resolve(sub);
      }).catch((err) => {
        this.log?.debug(`NATS subscription failed; ${err}`);
        callback(undefined, err);
        reject(err);
      });
    });
  }

  async unsubscribe(subject: string) {
    this.assertConnected();
    const sub = this.subscriptions[subject];
    if (!sub) {
      this.log?.debug(`Unable to unsubscribe from subject: ${subject}; subscription not found`);
      return;
    }

    sub.unsubscribe();
    delete this.subscriptions[subject];
  }

  async flush(): Promise<void> {
    this.assertConnected();
    return this.connection?.flush();
  }

  private assertConnected(): void {
    if (!this.connection) {
      throw new Error('No connection established');
    }

    if (this.connection.isClosed()) {
      throw new Error(`Connection is closed`);
    }
  }
}
