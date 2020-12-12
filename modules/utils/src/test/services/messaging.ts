import {
  ChannelUpdate,
  IMessagingService,
  InboundChannelUpdateError,
  LockError,
  LockInformation,
  MessagingError,
  OutboundChannelUpdateError,
  Result,
  FullChannelState,
  FullTransferState,
} from "@connext/vector-types";
import { Evt } from "evt";

import { getRandomBytes32 } from "../../hexStrings";

export class MemoryMessagingService implements IMessagingService {
  private readonly evt: Evt<{
    to?: string;
    from: string;
    inbox?: string;
    replyTo?: string;
    data: {
      update?: ChannelUpdate<any>;
      previousUpdate?: ChannelUpdate<any>;
      error?: InboundChannelUpdateError;
    };
  }> = Evt.create<{
    to?: string;
    from: string;
    inbox?: string;
    data: { update?: ChannelUpdate<any>; previousUpdate?: ChannelUpdate<any>; error?: InboundChannelUpdateError };
    replyTo?: string;
  }>();

  flush(): Promise<void> {
    throw new Error("Method not implemented.");
  }

  async connect(): Promise<void> {
    return;
  }

  async disconnect(): Promise<void> {
    this.evt.detach();
  }

  onReceiveCheckIn(
    myPublicIdentifier: string,
    callback: (nonce: string, from: string, inbox: string) => void,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  sendCheckInMessage(): Promise<Result<undefined, OutboundChannelUpdateError>> {
    throw new Error("Method not implemented.");
  }

  async sendProtocolMessage(
    channelUpdate: ChannelUpdate<any>,
    previousUpdate?: ChannelUpdate<any>,
    timeout = 20_000,
    numRetries = 0,
  ): Promise<
    Result<
      { update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> },
      OutboundChannelUpdateError | InboundChannelUpdateError
    >
  > {
    const inbox = getRandomBytes32();
    const responsePromise = this.evt.pipe((e) => e.inbox === inbox).waitFor(timeout);
    this.evt.post({
      to: channelUpdate.toIdentifier,
      from: channelUpdate.fromIdentifier,
      replyTo: inbox,
      data: { update: channelUpdate, previousUpdate },
    });
    const res = await responsePromise;
    if (res.data.error) {
      return Result.fail(res.data.error);
    }
    return Result.ok({ update: res.data.update!, previousUpdate: res.data.previousUpdate! });
  }

  async respondToProtocolMessage(
    inbox: string,
    channelUpdate: ChannelUpdate<any>,
    previousUpdate?: ChannelUpdate<any>,
  ): Promise<void> {
    this.evt.post({
      inbox,
      data: { update: channelUpdate, previousUpdate },
      from: channelUpdate.toIdentifier,
    });
  }

  async respondWithProtocolError(inbox: string, error: InboundChannelUpdateError): Promise<void> {
    this.evt.post({
      inbox,
      data: { error },
      from: error.update.toIdentifier,
    });
  }

  async onReceiveProtocolMessage(
    myPublicIdentifier: string,
    callback: (
      result: Result<{ update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> }, InboundChannelUpdateError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void> {
    this.evt
      .pipe(({ to }) => to === myPublicIdentifier)
      .attach(({ data, replyTo, from }) => {
        callback(
          Result.ok({
            previousUpdate: data.previousUpdate!,
            update: data.update!,
          }),
          from,
          replyTo!,
        );
      });
  }

  sendSetupMessage(
    setupInfo: { chainId: number; timeout: string },
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<{ channelAddress: string }, MessagingError>> {
    throw new Error("Method not implemented.");
  }

  onReceiveSetupMessage(
    publicIdentifier: string,
    callback: (
      setupInfo: Result<{ chainId: number; timeout: string }, MessagingError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  respondToSetupMessage(inbox: string, params: { message?: string; error?: string }): Promise<void> {
    throw new Error("Method not implemented.");
  }

  sendRequestCollateralMessage(
    requestCollateralParams: {} & { amount?: string } & { channelAddress: string; assetId: string },
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<undefined, Error>> {
    throw new Error("Method not implemented.");
  }

  onReceiveRequestCollateralMessage(
    publicIdentifier: string,
    callback: (
      params: Result<{} & { amount?: string } & { channelAddress: string; assetId: string }, Error>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  respondToRequestCollateralMessage(inbox: string, params: { message?: string; error?: string }): Promise<void> {
    throw new Error("Method not implemented.");
  }

  sendRestoreStateMessage(
    restoreInfo: { chainId: number } | { channelAddress: string; activeTransferIds: string[] },
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<{ channel: FullChannelState; activeTransfers: FullTransferState[] }, MessagingError>> {
    throw new Error("Method not implemented.");
  }
  onReceiveRestoreStateMessage(
    publicIdentifier: string,
    callback: (
      restoreInfo: Result<
        { chainId: number } | { channelAddress: string; activeTransferIds: string[] },
        MessagingError
      >,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  respondToRestoreStateMessage(
    inbox: string,
    infoToRestore: Result<{ channel: FullChannelState<any>; activeTransfers: FullTransferState[] }, MessagingError>,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }

  respondToLockMessage(inbox: string, lockInformation: LockInformation & { error?: string }): Promise<void> {
    throw new Error("Method not implemented.");
  }
  onReceiveLockMessage(
    publicIdentifier: string,
    callback: (lockInfo: Result<LockInformation, LockError>, from: string, inbox: string) => void,
  ): Promise<void> {
    throw new Error("Method not implemented.");
  }
  sendLockMessage(lockInfo: LockInformation, to: string, from: string): Promise<Result<string | void, LockError>> {
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
