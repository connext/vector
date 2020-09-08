import { ApplicationErrorFactory } from "../core/definitions/application-error-factory";
import { ErrorType } from "../core/definitions/error-type";
import { Interactor } from "../core/definitions/interactor";
import { IWalletService } from "../core/definitions/wallet.service";

import { DepositInput } from "./deposit.in";
import { DepositOutput } from "./deposit.out";
import { DepositValidator } from "./deposit.validator";

export class DepositInteractor implements Interactor {
  constructor(
    private depositValidator: DepositValidator,
    private walletService: IWalletService,
    private errorFactory: ApplicationErrorFactory,
  ) {}

  async execute(request: DepositInput): Promise<DepositOutput> {
    const result = this.depositValidator.validate(request);

    if (!result.valid) {
      throw this.errorFactory.getError(ErrorType.validation, result.error);
    }

    try {
      await this.walletService.deposit({
        amount: request.amount,
        assetId: request.assetId,
        channelId: request.channelId,
      });

      return { channelId: request.channelId };
    } catch (error) {
      throw this.errorFactory.getError(ErrorType.createChannel, error);
    }
  }
}
