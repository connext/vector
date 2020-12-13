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
  FullChannelState,
  FullTransferState,
  EngineError,
} from "@connext/vector-types";
import axios, { AxiosResponse } from "axios";
import pino, { BaseLogger } from "pino";
import { INatsService, natsServiceFactory } from "ts-natsutil";

import { isNode } from "./env";
import { safeJsonStringify } from "./json";

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
    this.assertConnected();
    const subject = `${channelUpdate.toIdentifier}.${channelUpdate.fromIdentifier}.protocol`;
    try {
      const msgBody = JSON.stringify({
        update: channelUpdate,
        previousUpdate,
      });
      this.log.debug({ method: "sendProtocolMessage", msgBody }, "Sending message");
      const msg = await this.connection!.request(subject, timeout, msgBody);
      this.log.debug({ method: "sendProtocolMessage", msgBody, msg }, "Received response");
      const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
      const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
      parsedMsg.data = parsedData;
      if (parsedMsg.data.error) {
        return Result.fail(
          new InboundChannelUpdateError(
            InboundChannelUpdateError.reasons.MessageFailed,
            channelUpdate,
            undefined,
            parsedMsg.data.error,
          ),
        );
      }
      // TODO: validate message structure
      return Result.ok({ update: parsedMsg.data.update, previousUpdate: parsedMsg.data.update });
    } catch (e) {
      return Result.fail(
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.MessageFailed, channelUpdate, undefined, {
          message: e.message,
          subject,
        }),
      );
    }
  }

  async onReceiveProtocolMessage(
    myPublicIdentifier: string,
    callback: (
      result: Result<{ update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> }, InboundChannelUpdateError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void> {
    this.assertConnected();
    const subscriptionSubject = `${myPublicIdentifier}.*.protocol`;
    await this.connection!.subscribe(subscriptionSubject, (msg, err) => {
      this.log.debug({ method: "onReceiveProtocolMessage", msg }, "Received message");
      const from = msg.subject.split(".")[1];
      if (err) {
        callback(Result.fail(new InboundChannelUpdateError(err, msg.data.update)), from, msg.reply);
        return;
      }
      const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
      const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
      // TODO: validate msg structure
      if (!parsedMsg.reply) {
        return;
      }
      parsedMsg.data = parsedData;
      if (parsedMsg.data.error) {
        callback(Result.fail(parsedMsg.data.error), from, parsedMsg.reply);
        return;
      }
      callback(
        Result.ok({ update: parsedMsg.data.update, previousUpdate: parsedMsg.data.previousUpdate }),
        from,
        parsedMsg.reply,
      );
    });
    this.log.debug({ method: "onReceiveProtocolMessage", subject: subscriptionSubject }, `Subscription created`);
  }

  async respondToProtocolMessage(
    inbox: string,
    channelUpdate: ChannelUpdate<any>,
    previousUpdate?: ChannelUpdate<any>,
  ): Promise<void> {
    this.assertConnected();
    const subject = inbox;
    this.log.debug(
      { method: "respondToProtocolMessage", subject, channelUpdate, previousUpdate },
      `Sending protocol response`,
    );
    await this.connection!.publish(
      subject,
      JSON.stringify({
        update: channelUpdate,
        previousUpdate,
      }),
    );
  }

  async respondWithProtocolError(inbox: string, error: InboundChannelUpdateError): Promise<void> {
    this.assertConnected();
    const subject = inbox;
    this.log.debug({ method: "respondWithProtocolError", subject, error }, `Sending protocol error response`);
    await this.connection!.publish(
      subject,
      JSON.stringify({
        error,
      }),
    );
  }
  ////////////

  // RESTORE METHODS
  async sendRestoreStateMessage(
    restoreData: Result<{ chainId: number } | { channelAddress: string }, EngineError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<{ channel: FullChannelState; activeTransfers: FullTransferState[] } | void, EngineError>> {
    this.assertConnected();
    const method = "sendRestoreStateMessage";
    try {
      const subject = `${to}.${from}.restore`;
      const msgBody = JSON.stringify({ restoreData });
      this.log.debug({ method, msgBody }, "Sending message");
      console.log("*********", method, "sending request", msgBody);
      const msg = await this.connection!.request(subject, timeout, msgBody);
      this.log.warn({ method, msg }, "Received response");
      const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
      const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
      parsedMsg.data = parsedData;
      console.log("*********", method, "got response", parsedMsg);
      if (parsedMsg.data.error) {
        return Result.fail(new MessagingError(MessagingError.reasons.Response, { error: parsedMsg.data.error }) as any);
      }
      return Result.ok(parsedMsg.data.value);
    } catch (e) {
      return Result.fail(new MessagingError(MessagingError.reasons.Unknown, { error: e.message }) as any);
    }
  }
  async onReceiveRestoreStateMessage(
    publicIdentifier: string,
    callback: (
      restoreData: Result<{ chainId: number } | { channelAddress: string }, EngineError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void> {
    this.assertConnected();
    const method = "onReceiveRestoreStateMessage";
    const subscriptionSubject = `${publicIdentifier}.*.restore`;
    await this.connection!.subscribe(subscriptionSubject, (msg, err) => {
      this.log.warn({ method, msg }, "Received message");
      const from = msg.subject.split(".")[1];
      const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
      console.log("*********", method, "got message", parsedMsg);
      if (err) {
        callback(Result.fail(new MessagingError(err) as any), from, msg.reply);
        return;
      }
      const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
      // TODO: validate msg structure
      if (!parsedMsg.reply) {
        return;
      }
      parsedMsg.data = parsedData;
      if (parsedMsg.data.error || parsedMsg.data.restoreData.error) {
        console.log(
          "*********",
          method,
          "handling callback with error",
          parsedMsg.data.restoreData.error ?? parsedMsg.data.error,
        );
        callback(Result.fail(parsedMsg.data.restoreData.error ?? parsedMsg.data.error), from, msg.reply);
        return;
      }
      callback(Result.ok(parsedMsg.data.restoreData.value), from, msg.reply);
    });
    this.log.debug({ method, subject: subscriptionSubject }, `Subscription created`);
  }
  async respondToRestoreStateMessage(
    inbox: string,
    restoreData: Result<{ channel: FullChannelState; activeTransfers: FullTransferState[] } | void, EngineError>,
  ): Promise<void> {
    this.assertConnected();
    const subject = inbox;
    this.log.warn({ method: "respondToRestoreStateMessage", subject }, `Sending response`);
    await this.connection!.publish(subject, safeJsonStringify(restoreData));
  }
  ////////////

  // SETUP METHODS
  async sendSetupMessage(
    setupInfo: { chainId: number; timeout: string },
    to: string,
    from: string,
    timeout = 30_000,
    numRetries = 0,
  ): Promise<Result<{ channelAddress: string }, MessagingError>> {
    this.assertConnected();
    const method = "sendSetupMessage";
    try {
      const subject = `${to}.${from}.setup`;
      const msgBody = JSON.stringify({ setupInfo });
      this.log.debug({ method, msgBody }, "Sending message");
      const msg = await this.connection!.request(subject, timeout, msgBody);
      this.log.debug({ method, msg }, "Received response");
      const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
      const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
      parsedMsg.data = parsedData;
      if (parsedMsg.data.error) {
        return Result.fail(new MessagingError(MessagingError.reasons.Response, { error: parsedMsg.data.error }));
      }
      return Result.ok({ channelAddress: parsedMsg.data.message });
    } catch (e) {
      return Result.fail(new MessagingError(MessagingError.reasons.Unknown, { error: e.message }));
    }
  }

  async onReceiveSetupMessage(
    publicIdentifier: string,
    callback: (
      setupInfo: Result<{ chainId: number; timeout: string }, MessagingError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void> {
    this.assertConnected();
    const method = "onReceiveSetupMessage";
    const subscriptionSubject = `${publicIdentifier}.*.setup`;
    await this.connection!.subscribe(subscriptionSubject, (msg, err) => {
      this.log.debug({ method, msg }, "Received message");
      const from = msg.subject.split(".")[1];
      const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
      if (err) {
        callback(Result.fail(new MessagingError(err)), from, msg.reply);
        return;
      }
      const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
      // TODO: validate msg structure
      if (!parsedMsg.reply) {
        return;
      }
      parsedMsg.data = parsedData;
      if (parsedMsg.data.error) {
        callback(Result.fail(parsedMsg.data.error), from, msg.reply);
        return;
      }
      callback(Result.ok(parsedMsg.data.setupInfo), from, msg.reply);
    });
    this.log.debug({ method, subject: subscriptionSubject }, `Subscription created`);
  }

  async respondToSetupMessage(inbox: string, params: { message?: string; error?: string } = {}): Promise<void> {
    this.assertConnected();
    const subject = inbox;
    this.log.debug({ method: "respondToSetupMessage", subject }, `Sending response`);
    await this.connection!.publish(subject, JSON.stringify(params));
  }
  ////////////

  // REQUEST COLLATERAL METHODS
  async sendRequestCollateralMessage(
    requestCollateralParams: EngineParams.RequestCollateral,
    to: string,
    from: string,
    timeout = 30_000,
    numRetries = 0,
  ): Promise<Result<undefined, Error>> {
    this.assertConnected();
    const method = "sendRequestCollateralMessage";
    try {
      const subject = `${to}.${from}.request-collateral`;
      const msgBody = JSON.stringify(requestCollateralParams);
      this.log.debug({ method, msgBody, subject }, "Sending message");
      const msg = await this.connection!.request(subject, timeout, msgBody);
      this.log.debug({ method, msgBody, msg }, "Received response");
      const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
      const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
      parsedMsg.data = parsedData;
      if (parsedMsg.data.error) {
        return Result.fail(new Error(parsedMsg.data.error));
      }
      return Result.ok(undefined);
    } catch (e) {
      return Result.fail(new Error(e.message));
    }
  }

  async onReceiveRequestCollateralMessage(
    publicIdentifier: string,
    callback: (params: Result<EngineParams.RequestCollateral, Error>, from: string, inbox: string) => void,
  ): Promise<void> {
    this.assertConnected();
    const method = "onReceiveRequestCollateralMessage";
    const subscriptionSubject = `${publicIdentifier}.*.request-collateral`;
    await this.connection!.subscribe(subscriptionSubject, (msg, err) => {
      this.log.debug({ method, msg }, "Received message");
      const from = msg.subject.split(".")[1];
      const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
      if (err) {
        callback(Result.fail(new Error(err)), from, msg.reply);
        return;
      }
      const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
      // TODO: validate msg structure
      if (!parsedMsg.reply) {
        return;
      }
      parsedMsg.data = parsedData;
      if (parsedMsg.data.error) {
        callback(Result.fail(parsedMsg.data.error), from, msg.reply);
        return;
      }
      callback(Result.ok(parsedMsg.data), from, msg.reply);
    });
    this.log.debug({ method, subject: subscriptionSubject }, `Subscription created`);
  }

  async respondToRequestCollateralMessage(
    inbox: string,
    params: { message?: string; error?: string } = {},
  ): Promise<void> {
    this.assertConnected();
    const subject = inbox;
    this.log.debug({ method: "respondToLockMessage", subject, params }, `Sending lock response`);
    await this.connection!.publish(subject, JSON.stringify(params));
  }
  ////////////

  // LOCK METHODS
  async sendLockMessage(
    lockInfo: LockInformation,
    to: string,
    from: string,
    timeout = 30_000, // TODO this timeout is copied from memolock
    numRetries = 0,
  ): Promise<Result<string | undefined, LockError>> {
    this.assertConnected();
    const method = "sendLockMessage";
    try {
      const subject = `${to}.${from}.lock`;
      const msgBody = JSON.stringify({ lockInfo });
      this.log.debug({ method, msgBody }, "Sending message");
      const msg = await this.connection!.request(subject, timeout, msgBody);
      this.log.debug({ method, msgBody, msg }, "Received response");
      const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
      const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
      parsedMsg.data = parsedData;
      if (parsedMsg.data.error) {
        return Result.fail(new LockError(LockError.reasons.Unknown, lockInfo));
      }
      if (lockInfo.type === "acquire" && !parsedMsg.data.lockInformation?.lockValue) {
        return Result.fail(new LockError(LockError.reasons.Unknown, lockInfo));
      }
      return Result.ok(parsedMsg.data.lockInformation?.lockValue);
    } catch (e) {
      return Result.fail(new LockError(LockError.reasons.Unknown, { ...lockInfo, error: e.message }));
    }
  }

  async onReceiveLockMessage(
    publicIdentifier: string,
    callback: (lockInfo: Result<LockInformation, LockError>, from: string, inbox: string) => void,
  ): Promise<void> {
    this.assertConnected();
    const method = "onReceiveLockMessage";
    const subscriptionSubject = `${publicIdentifier}.*.lock`;
    await this.connection!.subscribe(subscriptionSubject, (msg, err) => {
      this.log.debug({ method, msg }, "Received message");
      const from = msg.subject.split(".")[1];
      const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
      if (err) {
        callback(Result.fail(new LockError(err)), from, msg.reply);
        return;
      }
      const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
      // TODO: validate msg structure
      if (!parsedMsg.reply) {
        return;
      }
      parsedMsg.data = parsedData;
      if (parsedMsg.data.error) {
        callback(Result.fail(parsedMsg.data.error), from, msg.reply);
        return;
      }
      callback(Result.ok(parsedMsg.data.lockInfo), from, msg.reply);
    });
    this.log.debug({ method, subject: subscriptionSubject }, `Subscription created`);
  }

  async respondToLockMessage(inbox: string, lockInformation: LockInformation & { error?: string }): Promise<void> {
    this.assertConnected();
    const subject = inbox;
    this.log.debug({ method: "respondToLockMessage", subject, lockInformation }, `Sending lock response`);
    await this.connection!.publish(subject, JSON.stringify({ lockInformation }));
  }
  ////////////

  // CHECKIN METHODS
  onReceiveCheckIn(
    myPublicIdentifier: string,
    callback: (nonce: string, from: string, inbox: string) => void,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  sendCheckInMessage(): Promise<Result<undefined, OutboundChannelUpdateError>> {
    throw new Error("Method not implemented.");
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
}
