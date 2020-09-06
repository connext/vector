import { CreateChannelInteractor } from './create-channel.interactor';
import { TestEnvironment } from '../../test-environment';
import { CreateChannelInput } from './create-channel';
import { CreateChannelOutput } from './create-channel.out';
import { ValidatorResult } from '../core/definitions/validator-result';
import { CreateChannelValidator } from './create-channel.validator';

function isCreateChannelOutput(output: CreateChannelOutput): output is CreateChannelOutput {
  return (output as CreateChannelOutput) !== undefined;
}

describe('create channel interactor', () => {
  const validatorResult: ValidatorResult = { valid: true, error: null };

  let interactor: CreateChannelInteractor;
  let createChannelValidator: CreateChannelValidator;
  let errorFactory;

  beforeEach(() => {
    createChannelValidator = {
      validate: jest.fn(() => {
        return validatorResult;
      }),
    };

    errorFactory = {
      getError: jest.fn(() => new Error('error')),
    };

    interactor = TestEnvironment.createInstance(CreateChannelInteractor, [
      {
        name: 'createChannelValidator',
        useValue: createChannelValidator,
      },
      {
        name: 'errorFactory',
        useValue: errorFactory,
      },
    ]) as CreateChannelInteractor;
  });

  describe('execute', () => {
    it('should works', async () => {
      const request: CreateChannelInput = {
        chainId: 1337,
        publicIdentifier: 'indraABC',
      };

      const response = await interactor.execute(request);
      const isCorrectResponse = isCreateChannelOutput(response);
      expect(isCorrectResponse).toBeTruthy();
    });
  });
});
