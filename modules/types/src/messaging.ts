import { ChannelUpdate, FullChannelState, FullTransferState } from "./channel";
import { ConditionalTransferCreatedPayload, ConditionalTransferRoutingCompletePayload } from "./engine";
import { EngineError, NodeError, MessagingError, ProtocolError, Result, RouterError, VectorError } from "./error";
import { EngineParams, NodeResponses } from "./schemas";

export type CheckInInfo = { channelAddress: string };
export type CheckInResponse = {
  aliceIdentifier: string;
  bobIdentifier: string;
  chainId: number;
  channelAddress: string;
};

// All basic NATS messaging services
export interface IBasicMessaging {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  publish(subject: string, data: any): Promise<void>;
  subscribe(subject: string, cb: (data: any) => any): Promise<void>;
  unsubscribe(subject: string): Promise<void>;
  flush(): Promise<void>;
  request(subject: string, timeout: number, data: any): Promise<any>;
}

type TransferQuoteRequest = Omit<EngineParams.GetTransferQuote, "routerIdentifier">;
export interface IMessagingService extends IBasicMessaging {
  onReceiveProtocolMessage(
    myPublicIdentifier: string,
    callback: (
      result: Result<{ update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> }, ProtocolError>,
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
    Result<{ update: ChannelUpdate<any>; previousUpdate: ChannelUpdate<any> }, ProtocolError | MessagingError>
  >;
  respondToProtocolMessage(
    inbox: string,
    channelUpdate: ChannelUpdate<any>,
    previousUpdate?: ChannelUpdate<any>,
  ): Promise<void>;
  respondWithProtocolError(inbox: string, error: ProtocolError): Promise<void>;

  sendSetupMessage(
    setupInfo: Result<Omit<EngineParams.Setup, "counterpartyIdentifier">, EngineError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<{ channelAddress: string }, EngineError | MessagingError>>;
  onReceiveSetupMessage(
    publicIdentifier: string,
    callback: (
      setupInfo: Result<Omit<EngineParams.Setup, "counterpartyIdentifier">, EngineError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void>;
  respondToSetupMessage(inbox: string, params: Result<{ channelAddress: string }, EngineError>): Promise<void>;

  // restore flow:
  // - restore-r sends request
  // - counterparty receives
  //    1. acquires lock
  //    2. sends restore data
  // - counterparty responds
  // - restore-r restores
  sendRestoreStateMessage(
    restoreData: Result<{ chainId: number }, EngineError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<
    Result<{ channel: FullChannelState; activeTransfers: FullTransferState[] } | void, EngineError | MessagingError>
  >;
  onReceiveRestoreStateMessage(
    publicIdentifier: string,
    callback: (restoreData: Result<{ chainId: number }, EngineError>, from: string, inbox: string) => void,
  ): Promise<void>;
  respondToRestoreStateMessage(
    inbox: string,
    restoreData: Result<{ channel: FullChannelState; activeTransfers: FullTransferState[] } | void, EngineError>,
  ): Promise<void>;

  sendIsAliveMessage(
    isAlive: Result<{ channelAddress: string; skipCheckIn?: boolean }, EngineError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<{ channelAddress: string }, EngineError | MessagingError>>;
  onReceiveIsAliveMessage(
    publicIdentifier: string,
    callback: (
      isAlive: Result<{ channelAddress: string; skipCheckIn?: boolean }, EngineError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void>;
  respondToIsAliveMessage(inbox: string, params: Result<{ channelAddress: string }, EngineError>): Promise<void>;

  sendRequestCollateralMessage(
    requestCollateralParams: Result<EngineParams.RequestCollateral, EngineError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<undefined, EngineError | MessagingError>>;
  onReceiveRequestCollateralMessage(
    publicIdentifier: string,
    callback: (params: Result<EngineParams.RequestCollateral, EngineError>, from: string, inbox: string) => void,
  ): Promise<void>;
  respondToRequestCollateralMessage(inbox: string, params: Result<{ message?: string }, EngineError>): Promise<void>;

  onReceiveWithdrawalQuoteMessage(
    myPublicIdentifier: string,
    callback: (quoteRequest: Result<EngineParams.GetWithdrawalQuote, NodeError>, from: string, inbox: string) => void,
  ): Promise<void>;
  sendWithdrawalQuoteMessage(
    quoteRequest: Result<EngineParams.GetWithdrawalQuote, NodeError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<NodeResponses.WithdrawalQuote, NodeError | MessagingError>>;
  respondToWithdrawalQuoteMessage(
    inbox: string,
    quote: Result<NodeResponses.WithdrawalQuote, NodeError>,
  ): Promise<void>;

  sendRouterConfigMessage(
    configRequest: Result<void, VectorError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<NodeResponses.GetRouterConfig, RouterError | MessagingError>>;
  sendTransferQuoteMessage(
    quoteRequest: Result<TransferQuoteRequest, VectorError>,
    to: string,
    from: string,
    timeout?: number,
    numRetries?: number,
  ): Promise<Result<NodeResponses.TransferQuote, RouterError | MessagingError>>;

  publishTransferRoutingCompleteMessage(
    to: string,
    from: string,
    data: Result<Omit<ConditionalTransferRoutingCompletePayload, "publicIdentifier">, VectorError>,
  ): Promise<void>;
  onReceiveTransferRoutingCompleteMessage(
    myPublicIdentifier: string,
    callback: (
      data: Result<Omit<ConditionalTransferRoutingCompletePayload, "publicIdentifier">, NodeError>,
      from: string,
      inbox: string,
    ) => void,
  ): Promise<void>;
}
