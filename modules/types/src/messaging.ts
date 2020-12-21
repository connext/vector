import { ChannelUpdate } from "./channel";
import {
  InboundChannelUpdateError,
  IsAliveError,
  LockError,
  MessagingError,
  OutboundChannelUpdateError,
  Result,
} from "./error";
import { LockInformation } from "./lock";
import { EngineParams } from "./schemas";

export type IsAliveInfo = { channelAddress: string };
export type IsAliveResponse = {
  aliceIdentifier: string;
  bobIdentifier: string;
  chainId: number;
  channelAddress: string;
};

export interface IMessagingService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  onReceiveLockMessage(
    myPublicIdentifier: string,
    callback: (lockInfo: Result<LockInformation, LockError>, from: string, inbox: string) => void,
  ): Promise<void>;
  sendLockMessage(
    lockInfo: Result<LockInformation, LockError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<LockInformation, LockError>>;
  respondToLockMessage(inbox: string, lockInformation: Result<LockInformation, LockError>): Promise<void>;

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

  sendSetupMessage(
    setupInfo: Result<Omit<EngineParams.Setup, "counterpartyIdentifier">, Error>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<{ channelAddress: string }, MessagingError>>;
  onReceiveSetupMessage(
    publicIdentifier: string,
    callback: (
      setupInfo: Result<Omit<EngineParams.Setup, "counterpartyIdentifier">, MessagingError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void>;
  respondToSetupMessage(inbox: string, params: Result<{ channelAddress: string }, Error>): Promise<void>;

  sendIsAliveMessage(
    isAliveInfo: Result<IsAliveInfo, IsAliveError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<void, IsAliveError>>;
  onReceiveIsAliveMessage(
    publicIdentifier: string,
    callback: (isAliveInfo: Result<IsAliveInfo, IsAliveError>, from: string, inbox: string) => void,
  ): Promise<void>;
  respondToIsAliveMessage(inbox: string, params: Result<IsAliveResponse, IsAliveError>): Promise<void>;

  sendRequestCollateralMessage(
    requestCollateralParams: Result<EngineParams.RequestCollateral, Error>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<undefined, Error>>;
  onReceiveRequestCollateralMessage(
    publicIdentifier: string,
    callback: (params: Result<EngineParams.RequestCollateral, Error>, from: string, inbox: string) => void,
  ): Promise<void>;
  respondToRequestCollateralMessage(inbox: string, params: Result<{ message?: string }, Error>): Promise<void>;

  publish(subject: string, data: any): Promise<void>;
  subscribe(subject: string, cb: (data: any) => any): Promise<void>;
  unsubscribe(subject: string): Promise<void>;
  flush(): Promise<void>;
  request(subject: string, timeout: number, data: any): Promise<any>;
}
