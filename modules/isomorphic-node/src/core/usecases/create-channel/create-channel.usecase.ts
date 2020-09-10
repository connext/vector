import { constants } from "ethers";

import { IWalletService } from "../../shared/wallet/wallet.service";
import { UseCase } from "../../definitions/use-case";
import { Result } from "../../definitions/result";

import { CreateChannelInput } from "./create-channel.in";
import { CreateChannelOutput } from "./create-channel.out";
import { CreateChannelValidator } from "./create-channel.validator";
import { CreateChannelInvalidRequest } from "./errors/invalid-request";

export class CreateChannelUseCase implements UseCase<CreateChannelInput, CreateChannelOutput> {
  constructor(private createChannelValidator: CreateChannelValidator, private walletService: IWalletService) {}

  async execute(request: CreateChannelInput): Promise<CreateChannelOutput> {
    const result = this.createChannelValidator.validate(request);

    if (!result.valid) {
      return Result.fail(new CreateChannelInvalidRequest(request));
    }

    const channelId = constants.HashZero;
    const setupResult = await this.walletService.setup({
      chainId: request.chainId,
      channelId, // TODO: generate from identifiers
      participants: [this.walletService.getPublicIdentifier(), request.publicIdentifier],
    });

    if (setupResult.isError) {
      return Result.fail(setupResult.getError()!);
    }

    return Result.ok({ channelId });
  }
}
