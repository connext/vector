import {
  ChannelUpdate,
  CreateTransferParams,
  DepositParams,
  FullChannelState,
  ResolveTransferParams,
  SetupParams,
  UpdateType,
} from "./channel";
import { ChannelUpdateError, Result } from "./error";
import { ProtocolEventName, ProtocolEventPayloadsMap } from "./event";

export interface IVectorProtocol {
  signerAddress: string;
  publicIdentifier: string;
  setup(params: SetupParams): Promise<Result<FullChannelState, ChannelUpdateError>>;
  deposit(params: DepositParams): Promise<Result<FullChannelState, ChannelUpdateError>>;
  create(params: CreateTransferParams): Promise<Result<FullChannelState, ChannelUpdateError>>;
  resolve(params: ResolveTransferParams): Promise<Result<FullChannelState, ChannelUpdateError>>;
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
}

type VectorChannelMessageData<T extends UpdateType = any> = {
  update: ChannelUpdate<T>,
  latestUpdate: ChannelUpdate<any> | undefined,
}

export type VectorChannelMessage<T extends UpdateType = any> = {
  to: string;
  from: string;
  data: VectorChannelMessageData<T>;
};

export type VectorErrorMessage = Omit<VectorChannelMessage, "data"> & {
  error: ChannelUpdateError;
};

export type VectorMessage = VectorChannelMessage | VectorErrorMessage;

// TODO: fix these interfaces!
export type IOnchainService = any;
