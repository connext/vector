import { ChannelUpdate, ChannelUpdateError, IMessagingService, Result, VectorMessage } from "@connext/vector-types";
import { getRandomBytes32 } from "@connext/vector-utils";
import { Evt } from "evt";

export class MemoryMessagingService implements IMessagingService {
  private readonly evt: Evt<{
    to: string;
    from: string;
    inbox?: string;
    data: {
      update?: ChannelUpdate<any>;
      previousUpdate?: ChannelUpdate<any>;
      error?: ChannelUpdateError;
    };
    sentBy: string;
  }> = Evt.create<{
    to: string;
    from: string;
    inbox?: string;
    data: { update?: ChannelUpdate<any>; previousUpdate?: ChannelUpdate<any>; error?: ChannelUpdateError };
    sentBy: string;
  }>();

  async connect(): Promise<void> {
    return;
  }

  async sendProtocolMessage(
    channelUpdate: ChannelUpdate<any>,
    previousUpdate?: ChannelUpdate<any>,
    timeout = 20_000,
    numRetries = 0,
  ): Promise<Result<{ update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> }, ChannelUpdateError>> {
    const inbox = getRandomBytes32();
    const responsePromise = this.evt
      .pipe(
        ({ to, from, inbox, sentBy }) =>
          from === channelUpdate.fromIdentifier &&
          to === channelUpdate.toIdentifier &&
          inbox === inbox &&
          sentBy === channelUpdate.toIdentifier,
      )
      .waitFor(timeout);
    this.evt.post({
      to: channelUpdate.toIdentifier,
      from: channelUpdate.fromIdentifier,
      inbox,
      data: { update: channelUpdate, previousUpdate },
      sentBy: channelUpdate.fromIdentifier,
    });
    const res = await responsePromise;
    if (res.data.error) {
      return Result.fail(res.data.error);
    }
    return Result.ok({ update: res.data.update!, previousUpdate: res.data.previousUpdate! });
  }

  async respondToProtocolMessage(
    sentBy: string,
    channelUpdate: ChannelUpdate<any>,
    inbox: string,
    previousUpdate?: ChannelUpdate<any>,
  ): Promise<void> {
    this.evt.post({
      to: channelUpdate.toIdentifier,
      from: channelUpdate.fromIdentifier,
      inbox,
      data: { update: channelUpdate, previousUpdate },
      sentBy,
    });
  }

  async respondWithProtocolError(
    sender: string,
    receiver: string,
    inbox: string,
    error: ChannelUpdateError,
  ): Promise<void> {
    this.evt.post({
      to: receiver,
      from: sender,
      inbox,
      data: { error },
      sentBy: receiver,
    });
  }

  async onReceiveProtocolMessage(
    myPublicIdentifier: string,
    callback: (
      result: Result<{ update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> }, ChannelUpdateError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void> {
    this.evt
      .pipe(({ to, sentBy }) => to === myPublicIdentifier && sentBy !== myPublicIdentifier)
      .attach(({ data, inbox, from }) => {
        callback(
          Result.ok({
            previousUpdate: data.previousUpdate!,
            update: data.update!,
          }),
          from,
          inbox!,
        );
      });
  }

  send(to: string, msg: VectorMessage): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async subscribe(subject: string, callback: (data: any) => void): Promise<void> {
    throw new Error("Method not implemented.");
  }

  request(subject: string, timeout: number, data: any): Promise<any> {
    throw new Error("Method not implemented.");
  }

  async publish(subject: string, data: any): Promise<void> {
    throw new Error("Method not implemented.");
  }

  unsubscribe(subject: string): Promise<void> {
    throw new Error("Method not implemented.");
  }
}
