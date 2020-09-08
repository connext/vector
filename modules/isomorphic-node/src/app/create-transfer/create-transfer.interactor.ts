import { ApplicationErrorFactory } from '../core/definitions/application-error-factory';
import { Interactor } from '../core/definitions/interactor';
import { CreateTransferInput } from './create-transfer.in';
import { CreateTransferOutput } from './create-transfer.out';
import { CreateTransferValidator } from './create-transfer.validator';
import { ErrorType } from '../core/definitions/error-type';
import { IWalletService, TransferState } from '../core/definitions/wallet.service';
import { constants } from 'ethers';

export class CreateTransferInteractor implements Interactor {
  constructor(
    private createTransferValidator: CreateTransferValidator,
    private walletService: IWalletService,
    private errorFactory: ApplicationErrorFactory,
  ) {}

  async execute(request: CreateTransferInput): Promise<CreateTransferOutput> {
    const result = this.createTransferValidator.validate(request);

    if (!result.valid) {
      throw this.errorFactory.getError(ErrorType.validation, result.error);
    }

    try {
      const channel = await this.walletService.getChannel(request.channelId);
      if (!channel) {
        throw new Error('Channel not found');
      }
      const counterparty = channel.participants.find(
        (participant) => participant !== this.walletService.getSignerAddress(),
      );
      const initialState: TransferState = [
        { amount: request.amount, to: this.walletService.getSignerAddress() },
        { amount: constants.Zero, to: counterparty! },
      ];

      const meta = request.meta ?? {};
      if (request.recipient) {
        meta.recipient = request.recipient;
      }

      await this.walletService.create({
        amount: request.amount,
        assetId: request.assetId,
        channelId: request.channelId,
        initialState,
        timeout: constants.Zero,
        transferDefinition: constants.AddressZero,
        meta,
      });

      return { channelId: request.channelId, paymentId: request.paymentId, preImage: request.preImage };
    } catch (error) {
      throw this.errorFactory.getError(ErrorType.createChannel, error);
    }
  }
}
