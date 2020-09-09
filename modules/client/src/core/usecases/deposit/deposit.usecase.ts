import { Result } from "../../definitions/result";
import { UseCase } from "../../definitions/use-case";
import { IWalletService } from "../../shared/wallet/wallet.service";

import { DepositInput } from "./deposit.in";
import { DepositOutput } from "./deposit.out";
import { DepositValidator } from "./deposit.validator";
import { DepositInvalidRequest } from "./errors/invalid-request";

export class DepositUseCase implements UseCase<DepositInput, DepositOutput> {
  constructor(private depositValidator: DepositValidator, private walletService: IWalletService) {}

  async execute(request: DepositInput): Promise<DepositOutput> {
    const result = this.depositValidator.validate(request);

    if (!result.valid) {
      return Result.fail(new DepositInvalidRequest(request));
    }

    const depositResult = await this.walletService.deposit({
      amount: request.amount,
      assetId: request.assetId,
      channelId: request.channelId,
    });
    if (depositResult.isError) {
      return Result.fail(depositResult.getError()!);
    }

    return Result.ok({ channelId: request.channelId });
  }
}
