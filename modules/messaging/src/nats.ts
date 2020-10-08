import { connect, Payload, Client } from "ts-nats";
import { Config } from "./env";
import { ILogger, INatsService, INatsSubscription, natsPayloadTypeBinary, natsPayloadTypeJson } from ".";

const uuidv4 = require("uuid/v4");

export class NatsService implements INatsService {

  private bearerToken: string | undefined;
  private config: Config;
  private connection?: Client | null;
  private log?: ILogger;
  private pubCount = 0;
  private servers: string[];
  private subscriptions: { [key: string]: INatsSubscription } = {};
  private token?: string | undefined;

  constructor(
    log?: ILogger,
    servers?: string[],
    bearerToken?: string | undefined,
    token?: string | undefined,
  ) {
    this.bearerToken = bearerToken;
    this.config = Config.fromEnv();
    // this.clusterId = clusterId ? clusterId : this.config.natsClusterId;
    this.log = log;
    this.servers = servers ? servers : (this.config.natsServers || "").split(",");
    this.token = token ? token : this.config.natsToken;
  }

  async connect(): Promise<any> {
    if (this.connection && !this.connection.isClosed()) {
      this.log?.debug("Attempted to establish NATS connection short-circuirted; connection is already open");
      return Promise.resolve(this.connection);
    }

    return new Promise((resolve, reject) => {
      const clientId = `${this.config.natsClientPrefix}-${uuidv4()}`;
      connect({
        encoding: this.config.natsEncoding,
        payload: this.config.natsJson ? Payload[natsPayloadTypeJson] : Payload[natsPayloadTypeBinary],
        name: clientId,
        reconnect: true,
        maxPingOut: this.config.natsMaxPingOut,
        maxReconnectAttempts: -1,
        noEcho: this.config.natsNoEcho,
        noRandomize: false,
        pingInterval: this.config.natsPingInterval,
        servers: this.servers,
        token: this.token,
        tls: this.config.natsTlsOptions,
        userJWT: this.bearerToken,
        pedantic: this.config.natsPedantic,
        verbose: this.config.natsVerbose,
        url: this.servers[0],
      }).then((nc) => {
        this.connection = nc;

        nc.on("close", () => {
          this.log?.debug("Connection closed");
          this.connection = null;
        });

        nc.on("error", () => {
          if (nc.isClosed()) {
            this.log?.debug("Connection closed");
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
      this.connection?.subscribe(subject, (err, msg) => { callback(msg, err); }).then((sub: INatsSubscription) => {
        this.subscriptions[subject] = sub;
        resolve(sub);
      }).catch((err) => {
        this.log?.debug(`NATS subscription failed; ${err}`);
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
      throw new Error("No connection established");
    }

    if (this.connection.isClosed()) {
      throw new Error(`Connection is closed`);
    }
  }
}
