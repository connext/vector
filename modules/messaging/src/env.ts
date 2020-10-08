import { TlsOptions } from "tls";

export class Config {

  public natsClientPrefix: string = process.env.NATS_CLIENT_PREFIX || "vector";
  public natsClusterId?: string = process.env.NATS_CLUSTER_ID;
  public natsDeadLetterSubject: string = process.env.NATS_DEADLETTER_SUBJECT || "nats.deadletter";
  public natsEncoding: BufferEncoding = (process.env.NATS_BUFFER_ENCODING || "utf-8") as BufferEncoding;
  public natsJson: boolean | false = process.env.NATS_JSON === "true";
  public natsMaxPingOut: number = process.env.NATS_MAX_UNACKED_PINGS ? parseInt(process.env.NATS_MAX_UNACKED_PINGS, 10) : 3;
  public natsNoEcho: boolean | false = process.env.NATS_NO_ECHO === "true";
  public natsPedantic: boolean | false = process.env.NATS_PEDANTIC === "true";
  public natsPingInterval: number = (process.env.NATS_PING_INTERVAL ? parseInt(process.env.NATS_PING_INTERVAL, 10) : 30) * 1000;
  public natsServers?: string = process.env.NATS_SERVERS;
  public natsTlsConfigured: boolean = !!process.env.NATS_TLS_KEY && !!process.env.NATS_TLS_CERTIFICATE && !!process.env.NATS_CA_CERTIFICATE;
  public natsTlsOptions?: TlsOptions = this.natsTlsConfigured ? {
    // key: fs.readFileSync(process.env.NATS_TLS_KEY),
    // cert: fs.readFileSync(process.env.NATS_TLS_CERTIFICATE),
    // ca: [ fs.readFileSync(process.env.NATS_CA_CERTIFICATE) ],
    rejectUnauthorized: !(process.env.NATS_FORCE_TLS === "true"),
  } as TlsOptions : undefined;
  public natsToken?: string = process.env.NATS_TOKEN;
  public natsVerbose: boolean | false = process.env.NATS_VERBOSE === "true";
  public natsWebsocketEndpoints?: string = process.env.NATS_WEBSOCKET_ENDPOINTS;

  static camelize(str: string, sep: string): string {
    const split = str.split(sep);
    return split.reduce((acc: string, curr: string, i) => {
      if (i === 0) {
        return curr.toLowerCase();
      }
      return (acc + curr.charAt(0).toUpperCase() + curr.slice(1).toLowerCase());
    }, "");
  }

  static fromEnv(overrides?: Partial<Config>): Config {
    const instance = new Config();
    for (const [k, v] of Object.entries(process.env)) {
      if (v !== undefined) {
        (instance as any)[Config.camelize(k, "_")] = v;
      }
    }

    Object.keys(overrides || {}).forEach((key) => {
      (instance as any)[key] = (overrides as any)[key];
    });

    return instance;
  }
}
