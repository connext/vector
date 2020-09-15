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
import { EngineEventName, EngineEventPayloadsMap } from "./event";

export interface IVectorEngine {
  signerAddress: string;
  publicIdentifier: string;
  setup(params: SetupParams): Promise<Result<any, ChannelUpdateError>>;
  deposit(params: DepositParams): Promise<Result<FullChannelState, ChannelUpdateError>>;
  createTransfer(params: CreateTransferParams): Promise<Result<FullChannelState, ChannelUpdateError>>;
  resolveTransfer(params: ResolveTransferParams): Promise<Result<FullChannelState, ChannelUpdateError>>;
  on<T extends EngineEventName>(
    event: T,
    callback: (payload: EngineEventPayloadsMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventPayloadsMap[T]) => boolean,
  ): void;
  once<T extends EngineEventName>(
    event: T,
    callback: (payload: EngineEventPayloadsMap[T]) => void | Promise<void>,
    filter?: (payload: EngineEventPayloadsMap[T]) => boolean,
  ): void;
  waitFor<T extends EngineEventName>(
    event: T,
    timeout: number,
    filter?: (payload: EngineEventPayloadsMap[T]) => boolean,
  ): Promise<EngineEventPayloadsMap[T]>;
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
