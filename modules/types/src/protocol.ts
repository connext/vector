import {
  ChannelUpdate,
  CreateTransferParams,
  DepositParams,
  FullChannelState,
  FullTransferState,
  ResolveTransferParams,
  SetupParams,
  UpdateType,
} from "./channel";
import { InboundChannelUpdateError, OutboundChannelUpdateError, Result } from "./error";
import { ProtocolEventName, ProtocolEventPayloadsMap } from "./event";

export interface IVectorProtocol {
  signerAddress: string;
  publicIdentifier: string;
  setup(params: SetupParams): Promise<Result<FullChannelState, OutboundChannelUpdateError>>;
  deposit(params: DepositParams): Promise<Result<FullChannelState, OutboundChannelUpdateError>>;
  create(params: CreateTransferParams): Promise<Result<FullChannelState, OutboundChannelUpdateError>>;
  resolve(params: ResolveTransferParams): Promise<Result<FullChannelState, OutboundChannelUpdateError>>;
  on<T extends ProtocolEventName>(
    event: T,
    callback: (payload: ProtocolEventPayloadsMap[T]) => void | Promise<void>,
    filter?: (payload: ProtocolEventPayloadsMap[T]) => boolean,
  ): void;
  once<T extends ProtocolEventName>(
    event: T,
    callback: (payload: ProtocolEventPayloadsMap[T]) => void | Promise<void>,
    filter?: (payload: ProtocolEventPayloadsMap[T]) => boolean,
  ): void;
  waitFor<T extends ProtocolEventName>(
    event: T,
    timeout: number,
    filter?: (payload: ProtocolEventPayloadsMap[T]) => boolean,
  ): Promise<ProtocolEventPayloadsMap[T]>;

  getChannelState(channelAddress: string): Promise<FullChannelState | undefined>;
  getChannelStateByParticipants(alice: string, bob: string, chainId: number): Promise<FullChannelState | undefined>;
  getChannelStates(): Promise<FullChannelState[]>;
  getTransferState(transferId: string): Promise<FullTransferState | undefined>;
}

type VectorChannelMessageData<T extends UpdateType = any> = {
  update: ChannelUpdate<T>;
  latestUpdate: ChannelUpdate<any> | undefined;
};

export type VectorChannelMessage<T extends UpdateType = any> = {
  to: string;
  from: string;
  inbox: string;
  data: VectorChannelMessageData<T>;
};

export type VectorErrorMessage = Omit<VectorChannelMessage, "data"> & {
  error: InboundChannelUpdateError; // returned by the person receiving an update
};

export type VectorMessage = VectorChannelMessage | VectorErrorMessage;
