import { ChannelUpdate } from "./channel";
import { InboundChannelUpdateError, LockError, OutboundChannelUpdateError, Result } from "./error";
import { LockInformation } from "./lock";
import { EngineParams } from "./schemas";

export interface IMessagingService {
  connect(): Promise<void>;

  onReceiveLockMessage(
    myPublicIdentifier: string,
    callback: (lockInfo: Result<LockInformation, LockError>, from: string, inbox: string) => void,
  ): Promise<void>;
  sendLockMessage(
    lockInfo: LockInformation,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<string | void, LockError>>;
  respondToLockMessage(inbox: string, lockInformation: LockInformation & { error?: string }): Promise<void>;

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
  ): Promise<
    Result<
      { update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> },
      OutboundChannelUpdateError | InboundChannelUpdateError
    >
  >;
  respondToProtocolMessage(
    inbox: string,
    channelUpdate: ChannelUpdate<any>,
    previousUpdate?: ChannelUpdate<any>,
  ): Promise<void>;
  respondWithProtocolError(inbox: string, error: InboundChannelUpdateError): Promise<void>;

  sendRequestCollateralMessage(
    requestCollateralParams: EngineParams.RequestCollateral,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<undefined, Error>>;
  onReceiveRequestCollateralMessage(
    publicIdentifier: string,
    callback: (params: Result<EngineParams.RequestCollateral, Error>, from: string, inbox: string) => void,
  ): Promise<void>;
  respondToRequestCollateralMessage(inbox: string, params: { message?: string; error?: string }): Promise<void>;

  onReceiveCheckIn(
    myPublicIdentifier: string,
    callback: (nonce: string, from: string, inbox: string) => void,
  ): Promise<void>;
  sendCheckInMessage(): Promise<Result<undefined, OutboundChannelUpdateError>>;

  publish(subject: string, data: any): Promise<void>;
  subscribe(subject: string, cb: (data: any) => any): Promise<void>;
  unsubscribe(subject: string): Promise<void>;
  flush(): Promise<void>;
  request(subject: string, timeout: number, data: any): Promise<any>;
}
