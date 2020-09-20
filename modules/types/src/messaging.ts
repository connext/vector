import { ChannelUpdate } from "./channel";
import { InboundChannelUpdateError, Result } from "./error";
import { VectorMessage } from "./protocol";

export interface IMessagingService {
  connect(): Promise<void>;
  send(to: string, msg: VectorMessage): Promise<void>;
  onReceiveProtocolMessage(
    myPublicIdentifier: string,
    callback: (
      result: Result<{ update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> }, InboundChannelUpdateError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void>;
  sendProtocolMessage(
    channelUpdate: ChannelUpdate<any>,
    previousUpdate?: ChannelUpdate<any>,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<{ update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> }, InboundChannelUpdateError>>;
  respondToProtocolMessage(
    sentBy: string,
    channelUpdate: ChannelUpdate<any>,
    inbox: string,
    previousUpdate?: ChannelUpdate<any>,
  ): Promise<void>;
  respondWithProtocolError(
    sender: string,
    receiver: string,
    inbox: string,
    error: InboundChannelUpdateError,
  ): Promise<void>;
  publish(subject: string, data: any): Promise<void>;
  subscribe(subject: string, cb: (data: any) => any): Promise<void>;
  unsubscribe(subject: string): Promise<void>;
}

export type MessagingConfig = {
  clusterId?: string;
  messagingUrl: string | string[];
  options?: any;
  privateKey?: string;
  publicKey?: string;
  token?: string;
};
