import { ChannelUpdate } from "./channel";
import { InboundChannelUpdateError, LockError, OutboundChannelUpdateError, Result } from "./error";

export interface IMessagingService {
  connect(): Promise<void>;

  onReceiveLockMessage(
    myPublicIdentifier: string,
    callback: (
      msg: any, //TODO
    ) => void,
  ): Promise<void>;

  sendLockMessage(
    type: string,
    { myPublicIdentifier, counterpartyPublicIdentifier },
    lockName: string,
    lockValue?: string,
  ): Promise<Result<string | void, LockError>>;

  onReceiveProtocolMessage(
    myPublicIdentifier: string,
    callback: (
      result: Result<{ update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> }, InboundChannelUpdateError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void>;
  onReceiveCheckIn(
    myPublicIdentifier: string,
    callback: (nonce: string, from: string, inbox: string) => void,
  ): Promise<void>;

  sendProtocolMessage(
    channelUpdate: ChannelUpdate<any>,
    previousUpdate?: ChannelUpdate<any>,
    timeout?: number,
    numRetries?: number,
  ): Promise<
    Result<
      { update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> },
      OutboundChannelUpdateError | InboundChannelUpdateError
    >
  >;
  sendCheckInMessage(): Promise<Result<undefined, OutboundChannelUpdateError>>;

  respondToProtocolMessage(
    inbox: string,
    channelUpdate: ChannelUpdate<any>,
    previousUpdate?: ChannelUpdate<any>,
  ): Promise<void>;
  respondWithProtocolError(inbox: string, error: InboundChannelUpdateError): Promise<void>;

  publish(subject: string, data: any): Promise<void>;
  subscribe(subject: string, cb: (data: any) => any): Promise<void>;
  unsubscribe(subject: string): Promise<void>;
  flush(): Promise<void>;
  request(subject: string, timeout: number, data: any): Promise<any>;
}

export type MessagingConfig = {
  clusterId?: string;
  messagingUrl: string | string[];
  options?: any;
  privateKey?: string;
  publicKey?: string;
  token?: string;
};
