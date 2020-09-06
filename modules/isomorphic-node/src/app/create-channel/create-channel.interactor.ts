import { constants, BigNumber } from 'ethers';

import { ApplicationErrorFactory } from '../core/definitions/application-error-factory';
import { Interactor } from '../core/definitions/interactor';
import { CreateChannelInput } from './create-channel';
import { CreateChannelOutput } from './create-channel.out';
import { CreateChannelValidator } from './create-channel.validator';
import { ErrorType } from '../core/definitions/error-type';
import { IMessagingService } from '../core/definitions/messaging';
import { IWalletService } from '../core/definitions/wallet';

export class CreateChannelInteractor implements Interactor {
  constructor(
    private createChannelValidator: CreateChannelValidator,
    private errorFactory: ApplicationErrorFactory,
    private walletService: IWalletService,
  ) {}

  async execute(request: CreateChannelInput): Promise<CreateChannelOutput> {
    const result = this.createChannelValidator.validate(request);

    if (!result.valid) {
      throw this.errorFactory.getError(ErrorType.validation, result.error);
    }

    try {
      const result = await this.walletService.setup({});

      return {};
    } catch (error) {
      throw this.errorFactory.getError(ErrorType.createChannel, error);
    }
  }
}
