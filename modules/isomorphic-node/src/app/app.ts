import { CreateChannelInput } from "./core/usecases/create-channel/create-channel.in";
import { CreateChannelUseCase } from "./core/usecases/create-channel/create-channel.usecase";
import { CreateChannelOutput } from "./core/usecases/create-channel/create-channel.out";

export class App {
  constructor(private createChannelInteractor: CreateChannelUseCase) {}

  async createChannel(createChannelInput: CreateChannelInput): Promise<CreateChannelOutput> {
    return await this.createChannelInteractor.execute(createChannelInput);
  }
}
