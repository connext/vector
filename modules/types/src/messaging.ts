import { ChannelUpdate, FullChannelState, FullTransferState } from "./channel";
import { InboundChannelUpdateError, LockError, OutboundChannelUpdateError, Result, VectorError } from "./error";
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
    setupInfo: Result<Omit<EngineParams.Setup, "counterpartyIdentifier">, VectorError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<{ channelAddress: string }, VectorError>>;
  onReceiveSetupMessage(
    publicIdentifier: string,
    callback: (
      setupInfo: Result<Omit<EngineParams.Setup, "counterpartyIdentifier">, VectorError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void>;
  respondToSetupMessage(inbox: string, params: Result<{ channelAddress: string }, VectorError>): Promise<void>;

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
    restoreData: Result<{ chainId: number } | { channelAddress: string }, VectorError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<{ channel: FullChannelState; activeTransfers: FullTransferState[] } | void, VectorError>>;
  onReceiveRestoreStateMessage(
    publicIdentifier: string,
    callback: (
      restoreData: Result<{ chainId: number } | { channelAddress: string }, VectorError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void>;
  respondToRestoreStateMessage(
    inbox: string,
    restoreData: Result<{ channel: FullChannelState; activeTransfers: FullTransferState[] } | void, VectorError>,
  ): Promise<void>;

  sendIsAliveMessage(
    isAlive: Result<{ channelAddress: string; skipCheckIn?: boolean }, VectorError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<{ channelAddress: string }, VectorError>>;
  onReceiveIsAliveMessage(
    publicIdentifier: string,
    callback: (
      isAlive: Result<{ channelAddress: string; skipCheckIn?: boolean }, VectorError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void>;
  respondToIsAliveMessage(inbox: string, params: Result<{ channelAddress: string }, VectorError>): Promise<void>;

  sendRequestCollateralMessage(
    requestCollateralParams: Result<EngineParams.RequestCollateral, VectorError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<undefined, VectorError>>;
  onReceiveRequestCollateralMessage(
    publicIdentifier: string,
    callback: (params: Result<EngineParams.RequestCollateral, VectorError>, from: string, inbox: string) => void,
  ): Promise<void>;
  respondToRequestCollateralMessage(inbox: string, params: Result<{ message?: string }, VectorError>): Promise<void>;

  publish(subject: string, data: any): Promise<void>;
  subscribe(subject: string, cb: (data: any) => any): Promise<void>;
  unsubscribe(subject: string): Promise<void>;
  flush(): Promise<void>;
  request(subject: string, timeout: number, data: any): Promise<any>;
}
