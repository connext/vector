import { constants } from "ethers";
import { TransferState } from "@connext/vector-types";

import { IWalletService } from "../../shared/wallet/wallet.service";
import { UseCase } from "../../definitions/use-case";
import { Result } from "../../definitions/result";

import { CreateTransferInput } from "./create-transfer.in";
import { CreateTransferOutput } from "./create-transfer.out";
import { CreateTransferValidator } from "./create-transfer.validator";
import { CreateTransferInvalidRequest } from "./errors/invalid-request";

export class CreateTransferUseCase implements UseCase<CreateTransferInput, CreateTransferOutput> {
  constructor(private createTransferValidator: CreateTransferValidator, private walletService: IWalletService) {}

  async execute(request: CreateTransferInput): Promise<CreateTransferOutput> {
    const result = this.createTransferValidator.validate(request);

    if (!result.valid) {
      return Result.fail(new CreateTransferInvalidRequest(request));
    }

    const channelResult = await this.walletService.getChannel(request.channelId);
    if (channelResult.isError) {
      return Result.fail(channelResult.getError()!);
    }
    const channel = channelResult.getValue()!;
    const counterparty = channel.participants.find(
      (participant) => participant !== this.walletService.getSignerAddress(),
    );
    const transferInitialState: TransferState = {
      balance: { amount: [request.amount, "0"], to: [this.walletService.getSignerAddress(), counterparty!] },
      linkedHash: constants.HashZero,
    };

    const meta = request.meta ?? {};
    if (request.recipient) {
      meta.recipient = request.recipient;
    }

    const createResult = await this.walletService.create({
      amount: request.amount,
      assetId: request.assetId,
      timeout: "0",
      transferDefinition: constants.AddressZero,
      meta,
      channelAddress: request.channelId,
      encodings: [""],
      transferInitialState,
    });

    if (createResult.isError) {
      return Result.fail(createResult.getError()!);
    }

    return Result.ok({ channelId: request.channelId, paymentId: request.paymentId, preImage: request.preImage });
  }
}
