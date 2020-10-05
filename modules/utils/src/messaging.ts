import {
  ChannelUpdate,
  InboundChannelUpdateError,
  IMessagingService,
  MessagingConfig,
  Result,
  IChannelSigner,
  OutboundChannelUpdateError,
} from "@connext/vector-types";
import { INatsService, natsServiceFactory } from "ts-natsutil";
import { BaseLogger } from "pino";
import axios, { AxiosResponse } from "axios";

export const getBearerTokenFunction = (signer: IChannelSigner, authUrl: string) => async (): Promise<string> => {
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
  private bearerToken?: string;

  constructor(
    private readonly config: MessagingConfig,
    private readonly log: BaseLogger,
    private readonly getBearerToken: () => Promise<string>,
  ) {}

  onReceiveCheckIn(
    myPublicIdentifier: string,
    callback: (nonce: string, from: string, inbox: string) => void,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  sendCheckInMessage(): Promise<Result<undefined, OutboundChannelUpdateError>> {
    throw new Error("Method not implemented.");
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
    const messagingUrl = this.config.messagingUrl;
    if (!this.bearerToken) {
      this.bearerToken = await this.getBearerToken();
    }
    const service = natsServiceFactory(
      {
        bearerToken: this.bearerToken,
        natsServers: typeof messagingUrl === `string` ? [messagingUrl] : messagingUrl, // FIXME-- rename to servers instead of natsServers
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
    try {
      const subject = `${channelUpdate.toIdentifier}.${channelUpdate.fromIdentifier}.protocol`;
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
        new OutboundChannelUpdateError(OutboundChannelUpdateError.reasons.MessageFailed, channelUpdate, undefined, e),
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
    const subscriptionSubject = `${myPublicIdentifier}.>`;
    await this.connection!.subscribe(subscriptionSubject, (msg, err) => {
      this.log.debug({ method: "onReceiveProtocolMessage", msg }, "Received message");
      const from = msg.subject.split(".")[1];
      if (err) {
        callback(Result.fail(new InboundChannelUpdateError(err, msg.data.update)), from, msg.reply);
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
    unsubscribeFrom.forEach(sub => {
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
    subscribedTo.forEach(subscribedSubject => {
      let subjectIncludesAllSubstrings = true;
      substrsToMatch.forEach(match => {
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
