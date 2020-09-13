import { CreateTransferParams, DepositParams, FullChannelState, ResolveTransferParams, SetupParams } from "./channel";
import { GenericError, Result } from "./error";
import { EngineEventName, EngineEventPayloadsMap } from "./event";

export interface IVectorEngine {
  signerAddress: string;
  publicIdentifier: string;
  setup(params: SetupParams): Result<any, GenericError>;
  deposit(params: DepositParams): Result<FullChannelState, GenericError>;
  createTransfer(params: CreateTransferParams): Result<FullChannelState, GenericError>;
  resolveTransfer(params: ResolveTransferParams): Result<FullChannelState, GenericError>;
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
