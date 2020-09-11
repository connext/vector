import {
  ChannelState,
  DepositParams,
  CreateTransferParams,
  ResolveTransferParams,
  IStoreService,
  IMessagingService,
  ILockService,
  IChannelSigner,
  ChainProviders,
} from "@connext/vector-types";
import { Vector } from "@connext/vector-engine";

import { IWalletService } from "../../../../core/shared/wallet/wallet.service";
import { WalletError } from "../../../../core/shared/wallet/errors/wallet-error";
import { Result } from "../../../../core/definitions/result";
import { CreateChannelInput } from "../../../../core/usecases/create-channel/create-channel.in";

export class WalletService implements IWalletService {
  private vector: Vector | undefined;
  constructor(
    private readonly store: IStoreService,
    private readonly messaging: IMessagingService,
    private readonly lock: ILockService,
    private readonly signer: IChannelSigner,
    private readonly chainProviders: ChainProviders,
  ) {}

  async connect(): Promise<void> {
    this.vector = await Vector.connect(this.messaging, this.lock, this.store, this.signer, this.chainProviders);
  }

  getPublicIdentifier(): string {
    throw new Error("Method not implemented.");
  }
  getSignerAddress(): string {
    throw new Error("Method not implemented.");
  }
  setup(params: CreateChannelInput): Promise<Result<ChannelState, WalletError>> {
    throw new Error("Method not implemented.");
  }
  deposit(params: DepositParams): Promise<Result<ChannelState, WalletError>> {
    throw new Error("Method not implemented.");
  }
  create(params: CreateTransferParams): Promise<Result<ChannelState, WalletError>> {
    throw new Error("Method not implemented.");
  }
  resolve(params: ResolveTransferParams): Promise<Result<ChannelState, WalletError>> {
    throw new Error("Method not implemented.");
  }
  withdraw(params: unknown): Promise<Result<ChannelState, WalletError>> {
    throw new Error("Method not implemented.");
  }
  getChannel(channelId: string): Promise<Result<ChannelState | undefined, WalletError>> {
    throw new Error("Method not implemented.");
  }
}
