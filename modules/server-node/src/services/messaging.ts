import {
  ChannelUpdate,
  InboundChannelUpdateError,
  IMessagingService,
  MessagingConfig,
  Result,
  IChannelSigner,
} from "@connext/vector-types";
import { INatsService, natsServiceFactory } from "ts-natsutil";
import { BaseLogger } from "pino";
import axios, { AxiosResponse } from "axios";

import { config } from "../config";

export const getBearerTokenFunction = (signer: IChannelSigner) => async (): Promise<string> => {
  const nonceResponse = await axios.get(`${config.authUrl}/auth/${signer.publicIdentifier}`);
  const nonce = nonceResponse.data;
  const sig = await signer.signMessage(nonce);
  const verifyResponse: AxiosResponse<string> = await axios.post(`${config.authUrl}/auth`, {
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
    private readonly publicIdentifier: string,
  ) {}

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
  ): Promise<Result<{ update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> }, InboundChannelUpdateError>> {
    this.assertConnected();
    try {
      const subject = `${channelUpdate.toIdentifier}.${channelUpdate.fromIdentifier}.protocol`;
      console.log("sendProtocolMessage to subject: ", subject);
      const msg = await this.connection?.request(
        subject,
        timeout,
        JSON.stringify({
          update: channelUpdate,
          previousUpdate,
          from: this.publicIdentifier,
        }),
      );
      console.log("sendProtocolMessage response: ", msg);
      const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
      const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
      parsedMsg.data = parsedData;
      // TODO: validate message structure
      return Result.ok({ update: parsedMsg.data.update, previousUpdate: parsedMsg.data.update });
    } catch (e) {
      console.log("e: ", e);
      return Result.fail(new InboundChannelUpdateError(InboundChannelUpdateError.reasons.MessageFailed, {} as any));
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
    await this.connection?.subscribe(subscriptionSubject, (msg, err) => {
      console.log("onReceiveProtocolMessage msg: ", msg);
      const from = msg.subject.split(".")[1];
      if (err) {
        callback(Result.fail(new InboundChannelUpdateError(err, msg.data.update)), from, msg.reply);
      }
      const parsedMsg = typeof msg === `string` ? JSON.parse(msg) : msg;
      const parsedData = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
      // TODO: validate msg structure
      if (!parsedMsg.reply) {
        console.log(`MSG did not contain reply, ignoring`);
      }
      parsedMsg.data = parsedData;
      if (parsedMsg.data.error) {
        callback(Result.fail(parsedMsg.data.error), from, parsedMsg.reply);
      }
      callback(
        Result.ok({ update: parsedMsg.data.update, previousUpdate: parsedMsg.data.previousUpdate }),
        from,
        parsedMsg.reply,
      );
    });
  }

  async respondToProtocolMessage(
    sentBy: string,
    channelUpdate: ChannelUpdate<any>,
    inbox: string,
    previousUpdate?: ChannelUpdate<any>,
  ): Promise<void> {
    this.assertConnected();
    const subject = `${channelUpdate.toIdentifier}.${channelUpdate.fromIdentifier}.protocol`;
    console.log("respondToProtocolMessage to subject: ", subject);
    await this.connection?.publish(
      subject,
      JSON.stringify({
        update: channelUpdate,
        previousUpdate,
      }),
      inbox,
    );
  }

  async respondWithProtocolError(
    updateFromIdentifier: string,
    updateToIdentifier: string,
    inbox: string,
    error: InboundChannelUpdateError,
  ): Promise<void> {
    this.assertConnected();
    const subject = `${updateFromIdentifier}.${updateToIdentifier}.protocol`;
    console.log("respondToProtocolMessage to subject: ", subject);
    await this.connection?.publish(
      subject,
      JSON.stringify({
        error,
      }),
      inbox,
    );
  }

  public async onReceive(subject: string, callback: (msg: any) => void): Promise<void> {
    this.assertConnected();
    await this.connection!.subscribe(`${subject}.>`, (msg: any, err?: any): void => {
      if (err || !msg || !msg.data) {
        this.log.error(`Encountered an error while handling callback for message ${msg}: ${err}`);
      } else {
        const data = typeof msg.data === `string` ? JSON.parse(msg.data) : msg.data;
        this.log.debug(`Received message for ${subject}: ${JSON.stringify(data)}`);
        callback(data);
      }
    });
  }

  public async send(to: string, msg: any): Promise<void> {
    this.assertConnected();
    this.log.debug(`Sending message to ${to}: ${JSON.stringify(msg)}`);
    return this.connection!.publish(`${to}.${msg.from}`, JSON.stringify(msg));
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
