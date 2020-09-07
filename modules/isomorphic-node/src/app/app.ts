import { CreateChannelInput } from './create-channel/create-channel.in';
import { CreateChannelInteractor } from './create-channel/create-channel.interactor';
import { CreateChannelOutput } from './create-channel/create-channel.out';

export class App {
  constructor(private createChannelInteractor: CreateChannelInteractor) {}

  async createChannel(createChannelInput: CreateChannelInput): Promise<CreateChannelOutput> {
    return await this.createChannelInteractor.execute(createChannelInput);
  }
}
