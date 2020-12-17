import {
  IChannelSigner,
  ChannelUpdate,
  IMessagingService,
  InboundChannelUpdateError,
  LockError,
  LockInformation,
  OutboundChannelUpdateError,
  Result,
  EngineParams,
  MessagingError,
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

export class NatsMessagingService implements IMessagingService {
  private connection: INatsService | undefined;
  private log: BaseLogger;

  private authUrl?: string;
  private bearerToken?: string;
  private natsUrl?: string;
  private signer?: IChannelSigner;

  constructor(private readonly config: MessagingConfig) {
    this.log = config.logger || pino();

    // Either messagingUrl or authUrl+natsUrl must be specified
    if (config.messagingUrl) {
      this.authUrl = config.messagingUrl;
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
      throw new Error(`Either a messagingUrl or both an authUrl + natsUrl must be provided`);
    }

    // Let authUrl and/or natsUrl overwrite messagingUrl if both are provided
    if (config.authUrl) {
      this.authUrl = config.authUrl;
    }
    if (config.natsUrl) {
      this.natsUrl = config.natsUrl;
    }

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

  private assertConnected(): void {
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
    // TODO: fail fast w sensible error message if bearer token is invalid
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

  // PROTOCOL METHODS
  async sendProtocolMessage(
    channelUpdate: ChannelUpdate<any>,
    previousUpdate?: ChannelUpdate<any>,
    timeout = 30_000,
    numRetries = 0,
  ): Promise<
    Result<
      { update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> },
      OutboundChannelUpdateError | InboundChannelUpdateError
    >
  > {
    return this.sendMessage(
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
      result: Result<{ update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> }, InboundChannelUpdateError>,
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

  async respondWithProtocolError(inbox: string, error: InboundChannelUpdateError): Promise<void> {
    return this.respondToMessage(inbox, Result.fail(error), "respondWithProtocolError");
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
    return this.sendMessage(setupInfo, "setup", to, from, timeout, numRetries, method);
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
    requestCollateralParams: Result<EngineParams.RequestCollateral, Error>,
    to: string,
    from: string,
    timeout = 30_000,
    numRetries = 0,
  ): Promise<Result<undefined, Error>> {
    return this.sendMessage(
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
    callback: (params: Result<EngineParams.RequestCollateral, Error>, from: string, inbox: string) => void,
  ): Promise<void> {
    return this.registerCallback(
      `${publicIdentifier}.*.request-collateral`,
      callback,
      "onReceiveRequestCollateralMessage",
    );
  }

  async respondToRequestCollateralMessage(inbox: string, params: Result<{ message?: string }, Error>): Promise<void> {
    return this.respondToMessage(inbox, params, "respondToRequestCollateralMessage");
  }
  ////////////

  // LOCK METHODS
  async sendLockMessage(
    lockInfo: Result<LockInformation, LockError>,
    to: string,
    from: string,
    timeout = 30_000, // TODO this timeout is copied from memolock
    numRetries = 0,
  ): Promise<Result<LockInformation, LockError>> {
    return this.sendMessage(lockInfo, "lock", to, from, timeout, numRetries, "sendLockMessage");
  }

  async onReceiveLockMessage(
    publicIdentifier: string,
    callback: (lockInfo: Result<LockInformation, LockError>, from: string, inbox: string) => void,
  ): Promise<void> {
    return this.registerCallback(`${publicIdentifier}.*.lock`, callback, "onReceiveLockMessage");
  }

  async respondToLockMessage(inbox: string, lockInformation: Result<LockInformation, LockError>): Promise<void> {
    return this.respondToMessage(inbox, lockInformation, "respondToLockMessage");
  }
  ////////////

  // CHECKIN METHODS
  sendIsAliveMessage(
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<void, MessagingError>> {
    return this.sendMessage(Result.ok(undefined), "isalive", to, from, timeout, numRetries, "sendIsAliveMessage");
  }

  onReceiveIsAliveMessage(
    publicIdentifier: string,
    callback: (isAliveInfo: Result<undefined, MessagingError>, from: string, inbox: string) => void,
  ): Promise<void> {
    return this.registerCallback(`${publicIdentifier}.*.isalive`, callback, "onReceiveIsAliveMessage");
  }

  respondToIsAliveMessage(inbox: string, isAliveInfo: Result<void, Error>): Promise<void> {
    return this.respondToMessage(inbox, isAliveInfo, "respondToIsAliveMessage");
  }
  ////////////

  // Generic methods
  public async publish(subject: string, data: any): Promise<void> {
    this.assertConnected();
    this.log.debug(`Publishing ${subject}: ${JSON.stringify(data)}`);
    this.connection!.publish(subject, JSON.stringify(data));
  }

  public async request(subject: string, timeout: number, data: any): Promise<any> {
    this.assertConnected();
    this.log.debug(`Requesting ${subject} with data: ${JSON.stringify(data)}`);
    const response = await this.connection!.request(subject, timeout, JSON.stringify(data));
    this.log.debug(`Request for ${subject} returned: ${JSON.stringify(response)}`);
    return response;
  }

  public async subscribe(subject: string, callback: (msg: any) => void): Promise<void> {
    this.assertConnected();
    await this.connection!.subscribe(subject, (msg: any, err?: any): void => {
      if (err || !msg || !msg.data) {
        this.log.error({ msg, err }, `Encountered an error while handling callback for message`);
      } else {
        const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
        const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
        parsedMsg.data = parsedData;
        this.log.debug(`Subscription for ${subject}: ${JSON.stringify(parsedMsg)}`);
        callback(parsedMsg);
      }
    });
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

  private getSubjectsToUnsubscribeFrom(subject: string): string[] {
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
        if (!subscribedSubject.includes(match) && match !== ``) {
          subjectIncludesAllSubstrings = false;
        }
      });
      if (subjectIncludesAllSubstrings) {
        unsubscribeFrom.push(subscribedSubject);
      }
    });

    return unsubscribeFrom;
  }

  private async respondToMessage<T = any>(inbox: string, response: Result<T, Error>, method: string): Promise<void> {
    this.assertConnected();
    this.log.debug({ method, inbox }, `Sending response`);
    await this.connection!.publish(inbox, safeJsonStringify(response.toJson()));
  }

  private async registerCallback<T = any>(
    subscriptionSubject: string,
    callback: (dataReceived: Result<T, Error>, from: string, inbox: string) => void,
    method: string,
  ): Promise<void> {
    this.assertConnected();
    await this.connection!.subscribe(subscriptionSubject, (msg, err) => {
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

  // TODO: error typing
  private async sendMessage<T = any, R = any>(
    data: Result<T, any>,
    subjectSuffix: string,
    to: string,
    from: string,
    timeout: number,
    numRetries: number,
    method: string,
  ): Promise<Result<R, any>> {
    this.assertConnected();
    try {
      const subject = `${to}.${from}.${subjectSuffix}`;
      const msgBody = safeJsonStringify(data.toJson());
      this.log.debug({ method, msgBody }, "Sending message");
      const msg = await this.connection!.request(subject, timeout, msgBody);
      this.log.debug({ method, msg }, "Received response");
      const { result } = this.parseIncomingMessage<R>(msg);
      return result;
    } catch (e) {
      return Result.fail(new MessagingError(MessagingError.reasons.Unknown, { error: e.message }));
    }
  }

  private parseIncomingMessage<R>(msg: any): { result: Result<R, any>; parsed: any } {
    const parsedMsg = typeof msg === `string` ? safeJsonParse(msg) : msg;
    const parsedData = typeof msg.data === `string` ? safeJsonParse(msg.data) : msg.data;
    parsedMsg.data = parsedData;
    return { result: Result.fromJson<R, any>(parsedMsg.data), parsed: parsedMsg };
  }
}
