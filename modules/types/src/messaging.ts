import { ChannelUpdate, FullChannelState, FullTransferState } from "./channel";
import {
  EngineError,
  InboundChannelUpdateError,
  CheckInError,
  LockError,
  MessagingError,
  OutboundChannelUpdateError,
  Result,
} from "./error";
import { LockInformation } from "./lock";
import { EngineParams } from "./schemas";

export type CheckInInfo = { channelAddress: string };
export type CheckInResponse = {
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

  // restore flow:
  // - restore-r sends request
  // - counterparty receives
  //    1. acquires lock
  //    2. sends restore data
  // - counterparty responds
  // - restore-r restores
  // - restore-r sends result (err or success) to counterparty
  // - counterparty receives
  //    1. releases lock
  sendRestoreStateMessage(
    restoreData: Result<{ chainId: number } | { channelAddress: string }, Error>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<{ channel: FullChannelState; activeTransfers: FullTransferState[] } | void, EngineError>>;
  onReceiveRestoreStateMessage(
    publicIdentifier: string,
    callback: (
      restoreData: Result<{ chainId: number } | { channelAddress: string }, EngineError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void>;
  respondToRestoreStateMessage(
    inbox: string,
    restoreData: Result<{ channel: FullChannelState; activeTransfers: FullTransferState[] } | void, EngineError>,
  ): Promise<void>;

  sendCheckInMessage(
    checkInInfo: Result<CheckInInfo, CheckInError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<void, CheckInError>>;
  onReceiveCheckInMessage(
    publicIdentifier: string,
    callback: (checkInInfo: Result<CheckInInfo, CheckInError>, from: string, inbox: string) => void,
  ): Promise<void>;
  respondToCheckInMessage(inbox: string, params: Result<CheckInResponse, CheckInError>): Promise<void>;

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
