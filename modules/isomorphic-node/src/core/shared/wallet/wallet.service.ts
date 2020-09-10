import { DepositParams, CreateTransferParams, ResolveTransferParams, FullChannelState } from "@connext/vector-types";

import { Result } from "../../definitions/result";
import { CreateChannelInput } from "../../usecases/create-channel/create-channel.in";

import { WalletError } from "./errors/wallet-error";

export interface IWalletService {
  getPublicIdentifier(): string;
  getSignerAddress(): string;
  setup(params: CreateChannelInput): Promise<Result<FullChannelState, WalletError>>;
  deposit(params: DepositParams): Promise<Result<FullChannelState, WalletError>>;
  create(params: CreateTransferParams): Promise<Result<FullChannelState, WalletError>>;
  resolve(params: ResolveTransferParams): Promise<Result<FullChannelState, WalletError>>;
  withdraw(params: unknown): Promise<Result<FullChannelState, WalletError>>;
  getChannel(channelId: string): Promise<Result<FullChannelState | undefined, WalletError>>;
}
