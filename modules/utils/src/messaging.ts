import {
  IChannelSigner,
  ChannelUpdate,
  IMessagingService,
  NodeError,
  LockInformation,
  Result,
  EngineParams,
  FullChannelState,
  FullTransferState,
  EngineError,
  VectorError,
  MessagingError,
  ProtocolError,
  IBasicMessaging,
  RouterError,
  NodeResponses,
  NATS_CLUSTER_URL,
  NATS_AUTH_URL,
  NATS_WS_URL,
} from "@connext/vector-types";
import axios, { AxiosResponse } from "axios";
import pino, { BaseLogger } from "pino";
import { INatsService, natsServiceFactory } from "ts-natsutil";

import { isNode } from "./env";
import { safeJsonParse, safeJsonStringify } from "./json";

export { AuthService } from "ts-natsutil";

export type MessagingConfig = {
  messagingUrl?: string;
  authUrl?: string;
  natsUrl?: string;
  bearerToken?: string;
  signer?: IChannelSigner;
  logger?: BaseLogger;
};

export const getBearerToken = (authUrl: string, signer: IChannelSigner) => async (): Promise<string> => {
  const nonceResponse = await axios.get(`${authUrl}/auth/${signer.publicIdentifier}`);
  const nonce = nonceResponse.data;
  const sig = await signer.signMessage(nonce);
  const verifyResponse: AxiosResponse<string> = await axios.post(`${authUrl}/auth`, {
    sig,
    userIdentifier: signer.publicIdentifier,
  });
  return verifyResponse.data;
};

export class NatsBasicMessagingService implements IBasicMessaging {
  private connection: INatsService | undefined;
  private log: BaseLogger;

  private authUrl?: string;
  private bearerToken?: string;
  private natsUrl?: string;
  private signer?: IChannelSigner;

  constructor(config: MessagingConfig) {
    this.log = config.logger || pino();

    // Either messagingUrl or authUrl+natsUrl must be specified
    if (config.messagingUrl) {
      this.authUrl = config.messagingUrl;
      // backwards compatible config for new cluster
      if (config.messagingUrl === "https://messaging.connext.network") {
        config.authUrl = NATS_AUTH_URL;
        config.natsUrl = isNode() ? NATS_CLUSTER_URL : NATS_WS_URL;
      }
      if (isNode()) {
        this.natsUrl = `nats://${
          // Remove protocol prefix and port+path suffix
          config.messagingUrl
            .replace(/^.*:\/\//, "")
            .replace(/\//, "")
            .replace(/:[0-9]+/, "")
        }:4222`;
      } else {
        // Browser env
        this.natsUrl = `${
          // Replace "http" in the protocol with "ws" (preserving an "s" suffix if present)
          config.messagingUrl.replace(/:\/\/.*/, "").replace("http", "ws")
        }://${
          // Remove protocol prefix & path suffix from messaging Url
          config.messagingUrl.replace(/^.*:\/\//, "").replace(/\//, "")
        }/ws-nats`;
      }
      this.log.info(`Derived natsUrl=${this.natsUrl} from messagingUrl=${config.messagingUrl}`);
    } else if (!config.authUrl || !config.natsUrl) {
      config.authUrl = NATS_AUTH_URL;
      config.natsUrl = isNode() ? NATS_CLUSTER_URL : NATS_WS_URL;
    }

    // Let authUrl and/or natsUrl overwrite messagingUrl if both are provided
    if (config.authUrl) {
      this.authUrl = config.authUrl;
    }
    if (config.natsUrl) {
      this.natsUrl = config.natsUrl;
    }

    this.log.info({ natsUrl: this.natsUrl, authUrl: this.authUrl }, "Messaging config generated");

    if (config.bearerToken) {
      this.bearerToken = config.bearerToken;
    } else if (config.signer) {
      this.signer = config.signer;
    } else {
      throw new Error(`Either a bearerToken or signer must be provided`);
    }
  }

  private isConnected(): boolean {
    return !!this.connection?.isConnected();
  }

  public assertConnected(): void {
    if (!this.isConnected()) {
      throw new Error(`No connection detected, use connect() method`);
    }
  }

  async connect(): Promise<void> {
    if (!this.bearerToken) {
      const nonce = (await axios.get(`${this.authUrl}/auth/${this.signer.publicIdentifier}`)).data;
      const sig = await this.signer.signMessage(nonce);
      const verifyResponse: AxiosResponse<string> = await axios.post(`${this.authUrl}/auth`, {
        sig,
        userIdentifier: this.signer.publicIdentifier,
      });
      this.bearerToken = verifyResponse.data;
    }
    // TODO: fail fast w sensible error message if bearer token is invalid #446
    const service = natsServiceFactory(
      {
        bearerToken: this.bearerToken,
        natsServers: [this.natsUrl],
      },
      this.log.child({ module: "Messaging-Nats" }),
    );

    const natsConnection = await service.connect();
    this.connection = service;
    this.log.debug(`Connected!`);
    if (typeof natsConnection.addEventListener === "function") {
      natsConnection.addEventListener("close", async () => {
        this.bearerToken = undefined;
        await this.connect();
      });
    } else {
      natsConnection.on("close", async () => {
        this.bearerToken = undefined;
        await this.connect();
      });
    }
  }

  async disconnect(): Promise<void> {
    this.connection?.disconnect();
  }

  // Generic methods
  public async publish(subject: string, data: any): Promise<void> {
    this.assertConnected();
    const toPublish = safeJsonStringify(data);
    this.log.debug({ subject, data }, `Publishing`);
    await this.connection!.publish(subject, toPublish);
  }

  public async request(subject: string, timeout: number, data: any): Promise<any> {
    this.assertConnected();
    this.log.debug(`Requesting ${subject} with data: ${JSON.stringify(data)}`);
    const response = await this.connection!.request(subject, timeout, JSON.stringify(data));
    this.log.debug(`Request for ${subject} returned: ${JSON.stringify(response)}`);
    return response;
  }

  public async subscribe(subject: string, callback: (msg: any, err?: any) => void): Promise<void> {
    this.assertConnected();
    await this.connection!.subscribe(subject, (msg: any, err?: any): void => {
      const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
      const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
      parsedMsg.data = parsedData;
      callback(msg, err);
    });
    this.log.debug({ subject }, `Subscription created`);
  }

  public async unsubscribe(subject: string): Promise<void> {
    this.assertConnected();
    const unsubscribeFrom = this.getSubjectsToUnsubscribeFrom(subject);
    unsubscribeFrom.forEach((sub) => {
      this.connection!.unsubscribe(sub);
    });
  }

  public async flush(): Promise<void> {
    await this.connection!.flush();
  }

  // Helper methods
  protected getSubjectsToUnsubscribeFrom(subject: string): string[] {
    // must account for wildcards
    const subscribedTo = this.connection!.getSubscribedSubjects();
    const unsubscribeFrom: string[] = [];

    // get all the substrings to match in the existing subscriptions
    // anything after `>` doesnt matter
    // `*` represents any set of characters
    // if no match for split, will return [subject]
    const substrsToMatch = subject.split(`>`)[0].split(`*`);
    subscribedTo.forEach((subscribedSubject) => {
      let subjectIncludesAllSubstrings = true;
      substrsToMatch.forEach((match) => {
        if (!(subscribedSubject ?? "").includes(match) && match !== ``) {
          subjectIncludesAllSubstrings = false;
        }
      });
      if (subjectIncludesAllSubstrings) {
        unsubscribeFrom.push(subscribedSubject);
      }
    });

    return unsubscribeFrom;
  }

  protected async respondToMessage<T = any>(inbox: string, response: Result<T, Error>, method: string): Promise<void> {
    this.log.debug({ method, inbox }, `Sending response`);
    await this.publish(inbox, response.toJson());
  }

  protected async registerCallback<T = any>(
    subscriptionSubject: string,
    callback: (dataReceived: Result<T, VectorError>, from: string, inbox: string) => void,
    method: string,
  ): Promise<void> {
    await this.subscribe(subscriptionSubject, (msg, err) => {
      this.log.debug({ method, msg }, "Received message");
      const from = msg.subject.split(".")[1];
      if (err) {
        callback(Result.fail(new MessagingError(err)), from, msg.reply);
        return;
      }
      const { result, parsed } = this.parseIncomingMessage<T>(msg);
      if (!parsed.reply) {
        return;
      }

      callback(result, from, msg.reply);
      return;
    });
    this.log.debug({ method, subject: subscriptionSubject }, `Subscription created`);
  }

  private async sendMessage<T = any, R = any>(
    data: Result<T, any>,
    subjectSuffix: string,
    to: string,
    from: string,
    timeout: number,
    method: string,
  ): Promise<Result<R>> {
    this.assertConnected();
    const subject = `${to}.${from}.${subjectSuffix}`;
    const msgBody = safeJsonStringify(data.toJson());
    try {
      this.log.debug({ method, msgBody }, "Sending message");
      const msg = await this.request(subject, timeout, msgBody);
      this.log.debug({ method, msg }, "Received response");
      const { result } = this.parseIncomingMessage<R>(msg);
      return result;
    } catch (e) {
      this.log.error(
        { error: e.message ?? e, subject: subjectSuffix, data: msgBody, method },
        "Sending message failed",
      );
      const error = e.message ?? e ?? "";
      return Result.fail(
        new MessagingError(
          error.includes("Request timed out") || error.includes("timeout")
            ? MessagingError.reasons.Timeout
            : MessagingError.reasons.Unknown,
          {
            messagingError: e.message ?? e,
            subject,
            data: data.toJson(),
            method,
          },
        ),
      );
    }
  }

  protected async sendMessageWithRetries<T = any, R = any>(
    data: Result<T, any>,
    subjectSuffix: string,
    to: string,
    from: string,
    timeout: number,
    numRetries: number,
    method: string,
  ): Promise<Result<R, any>> {
    // FIXME: apparently we don't know how to write for loops
    // let result: Result<R>;
    const result = await this.sendMessage(data, subjectSuffix, to, from, timeout, method);
    // for (let attempt = 0; attempt++; attempt < numRetries + 1) {
    //   result = await this.sendMessage(data, subjectSuffix, to, from, timeout, method);
    //   if (result.isError && result.getError()!.message === MessagingError.reasons.Timeout) {
    //     this.log.warn({ attempt, numRetries }, "Message timed out, retrying");
    //     // wait a bit
    //     await delay(1000);
    //     continue;
    //   }
    //   // not an error, break
    //   break;
    // }
    return result;
  }

  protected parseIncomingMessage<R>(msg: any): { result: Result<R, any>; parsed: any } {
    const parsedMsg = typeof msg === `string` ? safeJsonParse(msg) : msg;
    const parsedData = typeof msg.data === `string` ? safeJsonParse(msg.data) : msg.data;
    parsedMsg.data = parsedData;
    return { result: Result.fromJson<R, any>(parsedMsg.data), parsed: parsedMsg };
  }
}

export class NatsMessagingService extends NatsBasicMessagingService implements IMessagingService {
  private logger: BaseLogger;

  constructor(private readonly config: MessagingConfig) {
    super(config);
    this.logger = config.logger ?? pino();
  }

  // PROTOCOL METHODS
  async sendProtocolMessage(
    channelUpdate: ChannelUpdate<any>,
    previousUpdate?: ChannelUpdate<any>,
    timeout = 30_000,
    numRetries = 0,
  ): Promise<Result<{ update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> }, ProtocolError>> {
    return this.sendMessageWithRetries(
      Result.ok({ update: channelUpdate, previousUpdate }),
      "protocol",
      channelUpdate.toIdentifier,
      channelUpdate.fromIdentifier,
      timeout,
      numRetries,
      "sendProtocolMessage",
    );
  }

  async onReceiveProtocolMessage(
    myPublicIdentifier: string,
    callback: (
      result: Result<{ update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> }, ProtocolError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void> {
    return this.registerCallback(`${myPublicIdentifier}.*.protocol`, callback, "onReceiveProtocolMessage");
  }

  async respondToProtocolMessage(
    inbox: string,
    channelUpdate: ChannelUpdate<any>,
    previousUpdate?: ChannelUpdate<any>,
  ): Promise<void> {
    return this.respondToMessage(
      inbox,
      Result.ok({ update: channelUpdate, previousUpdate }),
      "respondToProtocolMessage",
    );
  }

  async respondWithProtocolError(inbox: string, error: ProtocolError): Promise<void> {
    return this.respondToMessage(inbox, Result.fail(error), "respondWithProtocolError");
  }
  ////////////

  // RESTORE METHODS
  async sendRestoreStateMessage(
    restoreData: Result<{ chainId: number } | { channelAddress: string }, EngineError>,
    to: string,
    from: string,
    timeout = 30_000,
    numRetries?: number,
  ): Promise<Result<{ channel: FullChannelState; activeTransfers: FullTransferState[] } | void, EngineError>> {
    return this.sendMessageWithRetries(
      restoreData,
      "restore",
      to,
      from,
      timeout,
      numRetries,
      "sendRestoreStateMessage",
    );
  }

  async onReceiveRestoreStateMessage(
    publicIdentifier: string,
    callback: (
      restoreData: Result<{ chainId: number } | { channelAddress: string }, EngineError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void> {
    await this.registerCallback(`${publicIdentifier}.*.restore`, callback, "onReceiveRestoreStateMessage");
  }

  async respondToRestoreStateMessage(
    inbox: string,
    restoreData: Result<{ channel: FullChannelState; activeTransfers: FullTransferState[] } | void, EngineError>,
  ): Promise<void> {
    return this.respondToMessage(inbox, restoreData, "respondToRestoreStateMessage");
  }
  ////////////

  // SETUP METHODS
  async sendSetupMessage(
    setupInfo: Result<Omit<EngineParams.Setup, "counterpartyIdentifier">, Error>,
    to: string,
    from: string,
    timeout = 30_000,
    numRetries = 0,
  ): Promise<Result<{ channelAddress: string }, MessagingError>> {
    const method = "sendSetupMessage";
    return this.sendMessageWithRetries(setupInfo, "setup", to, from, timeout, numRetries, method);
  }

  async onReceiveSetupMessage(
    publicIdentifier: string,
    callback: (
      setupInfo: Result<Omit<EngineParams.Setup, "counterpartyIdentifier">, MessagingError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void> {
    await this.registerCallback(`${publicIdentifier}.*.setup`, callback, "onReceiveSetupMessage");
  }

  async respondToSetupMessage(inbox: string, params: Result<{ channelAddress: string }, Error>): Promise<void> {
    return this.respondToMessage(inbox, params, "respondToSetupMessage");
  }
  ////////////

  // REQUEST COLLATERAL METHODS
  async sendRequestCollateralMessage(
    requestCollateralParams: Result<EngineParams.RequestCollateral, VectorError>,
    to: string,
    from: string,
    timeout = 30_000,
    numRetries = 0,
  ): Promise<Result<undefined, VectorError>> {
    return this.sendMessageWithRetries(
      requestCollateralParams,
      "request-collateral",
      to,
      from,
      timeout,
      numRetries,
      "sendRequestCollateralMessage",
    );
  }

  async onReceiveRequestCollateralMessage(
    publicIdentifier: string,
    callback: (params: Result<EngineParams.RequestCollateral, VectorError>, from: string, inbox: string) => void,
  ): Promise<void> {
    return this.registerCallback(
      `${publicIdentifier}.*.request-collateral`,
      callback,
      "onReceiveRequestCollateralMessage",
    );
  }

  async respondToRequestCollateralMessage(
    inbox: string,
    params: Result<{ message?: string }, VectorError>,
  ): Promise<void> {
    return this.respondToMessage(inbox, params, "respondToRequestCollateralMessage");
  }
  ////////////

  // LOCK METHODS
  async sendLockMessage(
    lockInfo: Result<LockInformation, NodeError>,
    to: string,
    from: string,
    timeout = 30_000, // TODO this timeout is copied from memolock
    numRetries = 0,
  ): Promise<Result<LockInformation, NodeError>> {
    return this.sendMessageWithRetries(lockInfo, "lock", to, from, timeout, numRetries, "sendLockMessage");
  }

  async onReceiveLockMessage(
    publicIdentifier: string,
    callback: (lockInfo: Result<LockInformation, NodeError>, from: string, inbox: string) => void,
  ): Promise<void> {
    return this.registerCallback(`${publicIdentifier}.*.lock`, callback, "onReceiveLockMessage");
  }

  async respondToLockMessage(inbox: string, lockInformation: Result<LockInformation, NodeError>): Promise<void> {
    return this.respondToMessage(inbox, lockInformation, "respondToLockMessage");
  }
  ////////////

  // ISALIVE METHODS
  sendIsAliveMessage(
    isAlive: Result<{ channelAddress: string; skipCheckIn?: boolean }, VectorError>,
    to: string,
    from: string,
    timeout = 30_000,
    numRetries?: number,
  ): Promise<Result<{ channelAddress: string }, VectorError>> {
    return this.sendMessageWithRetries(isAlive, "isalive", to, from, timeout, numRetries, "sendIsAliveMessage");
  }

  onReceiveIsAliveMessage(
    publicIdentifier: string,
    callback: (
      isAlive: Result<{ channelAddress: string; skipCheckIn?: boolean }, VectorError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void> {
    return this.registerCallback(`${publicIdentifier}.*.isalive`, callback, "onReceiveIsAliveMessage");
  }

  respondToIsAliveMessage(inbox: string, params: Result<{ channelAddress: string }, VectorError>): Promise<void> {
    return this.respondToMessage(inbox, params, "respondToIsAliveMessage");
  }
  ////////////

  // CONFIG METHODS
  async sendRouterConfigMessage(
    configRequest: Result<void, VectorError>,
    to: string,
    from: string,
    timeout = 30_000,
    numRetries?: number,
  ): Promise<Result<NodeResponses.GetRouterConfig, RouterError | MessagingError>> {
    return this.sendMessageWithRetries(
      configRequest,
      "config",
      to,
      from,
      timeout,
      numRetries,
      "sendRouterConfigMessage",
    );
  }
  ////////////

  // TRANSFER QUOTE METHODS
  sendTransferQuoteMessage(
    quoteRequest: Result<Omit<EngineParams.GetTransferQuote, "routerIdentifier">, VectorError>,
    to: string,
    from: string,
    timeout = 30_000,
    numRetries?: number,
  ): Promise<Result<NodeResponses.TransferQuote, RouterError | MessagingError>> {
    return this.sendMessageWithRetries(
      quoteRequest,
      "transfer-quote",
      to,
      from,
      timeout,
      numRetries,
      "sendTransferQuoteMessage",
    );
  }
  ////////////

  // WITHDRAWAL QUOTE METHODS
  sendWithdrawalQuoteMessage(
    quoteRequest: Result<EngineParams.GetWithdrawalQuote, NodeError>,
    to: string,
    from: string,
    timeout = 30_000,
    numRetries?: number,
  ): Promise<Result<NodeResponses.WithdrawalQuote, NodeError | MessagingError>> {
    return this.sendMessageWithRetries(
      quoteRequest,
      "withdrawal-quote",
      to,
      from,
      timeout,
      numRetries,
      "sendWithdrawalQuoteMessage",
    );
  }

  onReceiveWithdrawalQuoteMessage(
    myPublicIdentifier: string,
    callback: (quoteRequest: Result<EngineParams.GetWithdrawalQuote, NodeError>, from: string, inbox: string) => void,
  ): Promise<void> {
    return this.registerCallback(
      `${myPublicIdentifier}.*.withdrawal-quote`,
      callback,
      "onReceiveWithdrawalQuoteMessage",
    );
  }

  respondToWithdrawalQuoteMessage(
    inbox: string,
    quote: Result<NodeResponses.WithdrawalQuote, NodeError>,
  ): Promise<void> {
    return this.respondToMessage(inbox, quote, "respondToWithdrawalQuoteMessage");
  }
  ////////////
}
