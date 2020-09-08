import { fake } from "sinon";

import { TestEnvironment } from "../../../../test-environment";
import { expect } from "../../../../test/assert";
import { mockWalletService } from "../../../../test/mocks/wallet";
import { ValidatorResult } from "../../definitions/validator-result";

import { CreateChannelUseCase } from "./create-channel.usecase";
import { CreateChannelValidator } from "./create-channel.validator";
import { CreateChannelOutput } from "./create-channel.out";
import { CreateChannelInput } from "./create-channel.in";

function isCreateChannelOutput(output: CreateChannelOutput): output is CreateChannelOutput {
  return (output as CreateChannelOutput) !== undefined;
}

describe("create channel interactor", () => {
  const validatorResult: ValidatorResult = { valid: true, error: null };

  let interactor: CreateChannelUseCase;
  let createChannelValidator: CreateChannelValidator;

  beforeEach(() => {
    createChannelValidator = {
      validate: fake(() => {
        return validatorResult;
      }),
    };

    interactor = TestEnvironment.createInstance(CreateChannelUseCase, [
      {
        name: "createChannelValidator",
        useValue: createChannelValidator,
      },
      {
        name: "walletService",
        useValue: mockWalletService,
      },
    ]) as CreateChannelUseCase;
  });

  describe("execute", () => {
    it("should work", async () => {
      const request: CreateChannelInput = {
        chainId: 1337,
        publicIdentifier: "indraABC",
      };

      const result = await interactor.execute(request);
      const isCorrectResponse = isCreateChannelOutput(result);
      expect(isCorrectResponse).to.be.ok;
      expect(result.getValue()).to.be.ok;
    });
  });
});
