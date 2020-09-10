import { CreateChannelInput } from "./usecases/create-channel/create-channel.in";
import { CreateChannelUseCase } from "./usecases/create-channel/create-channel.usecase";
import { CreateChannelOutput } from "./usecases/create-channel/create-channel.out";
import { DepositUseCase } from "./usecases/deposit/deposit.usecase";
import { DepositInput } from "./usecases/deposit/deposit.in";
import { DepositOutput } from "./usecases/deposit/deposit.out";
import { CreateTransferInput } from "./usecases/create-transfer/create-transfer.in";
import { CreateTransferOutput } from "./usecases/create-transfer/create-transfer.out";
import { CreateTransferUseCase } from "./usecases/create-transfer/create-transfer.usecase";

export interface IIsomorphicNode {
  createChannel(createChannelInput: CreateChannelInput): Promise<CreateChannelOutput>;
  deposit(depositInput: DepositInput): Promise<DepositOutput>;
  createTransfer(createTransferInput: CreateTransferInput): Promise<CreateTransferOutput>;
}

export class IsomorphicNode implements IIsomorphicNode {
  constructor(
    private readonly createChannelUseCase: CreateChannelUseCase,
    private readonly depositUseCase: DepositUseCase,
    private readonly createTransferUseCase: CreateTransferUseCase,
  ) {}

  async createChannel(createChannelInput: CreateChannelInput): Promise<CreateChannelOutput> {
    return await this.createChannelUseCase.execute(createChannelInput);
  }

  async deposit(depositInput: DepositInput): Promise<DepositOutput> {
    return await this.depositUseCase.execute(depositInput);
  }

  async createTransfer(createTransferInput: CreateTransferInput): Promise<CreateTransferOutput> {
    return await this.createTransferUseCase.execute(createTransferInput);
  }
}
