import { constants } from "ethers";

import { ApplicationErrorFactory } from "../core/definitions/application-error-factory";
import { ErrorType } from "../core/definitions/error-type";
import { Interactor } from "../core/definitions/interactor";
import { IWalletService } from "../core/definitions/wallet.service";

import { CreateChannelInput } from "./create-channel.in";
import { CreateChannelOutput } from "./create-channel.out";
import { CreateChannelValidator } from "./create-channel.validator";

export class CreateChannelInteractor implements Interactor {
  constructor(
    private createChannelValidator: CreateChannelValidator,
    private walletService: IWalletService,
    private errorFactory: ApplicationErrorFactory,
  ) {}

  async execute(request: CreateChannelInput): Promise<CreateChannelOutput> {
    const result = this.createChannelValidator.validate(request);

    if (!result.valid) {
      throw this.errorFactory.getError(ErrorType.validation, result.error);
    }

    try {
      const channelId = constants.HashZero;
      await this.walletService.setup({
        chainId: request.chainId,
        channelId, // TODO: generate from identifiers
        participants: [this.walletService.getPublicIdentifier(), request.publicIdentifier],
      });

      return { channelId };
    } catch (error) {
      throw this.errorFactory.getError(ErrorType.createChannel, error);
    }
  }
}
