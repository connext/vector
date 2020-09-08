import { fake } from 'sinon';
import { constants } from 'ethers';

import { CreateTransferInteractor } from './create-transfer.interactor';
import { TestEnvironment } from '../../test-environment';
import { CreateTransferInput } from './create-transfer.in';
import { CreateTransferOutput } from './create-transfer.out';
import { ValidatorResult } from '../core/definitions/validator-result';
import { CreateTransferValidator } from './create-transfer.validator';
import { expect } from '../../test/assert';
import { mockWalletService } from '../../test/mocks/wallet';

function isDepositOutput(output: CreateTransferOutput): output is CreateTransferOutput {
  return (output as CreateTransferOutput) !== undefined;
}

describe('deposit interactor', () => {
  const validatorResult: ValidatorResult = { valid: true, error: null };

  let interactor: CreateTransferInteractor;
  let depositValidator: CreateTransferValidator;
  let errorFactory;

  beforeEach(() => {
    depositValidator = {
      validate: fake(() => {
        return validatorResult;
      }),
    };

    errorFactory = {
      getError: fake(() => new Error('error')),
    };

    interactor = TestEnvironment.createInstance(CreateTransferInteractor, [
      {
        name: 'createTransferValidator',
        useValue: depositValidator,
      },
      {
        name: 'walletService',
        useValue: mockWalletService,
      },
      {
        name: 'errorFactory',
        useValue: errorFactory,
      },
    ]) as CreateTransferInteractor;
  });

  describe('execute', () => {
    it('should work', async () => {
      const request: CreateTransferInput = {
        amount: constants.One,
        assetId: constants.AddressZero,
        channelId: constants.AddressZero,
      };

      const response = await interactor.execute(request);
      const isCorrectResponse = isDepositOutput(response);
      expect(isCorrectResponse).to.be.ok;
    });
  });
});
