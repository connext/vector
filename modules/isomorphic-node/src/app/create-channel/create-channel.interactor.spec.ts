import { fake } from "sinon";

import { TestEnvironment } from "../../test-environment";
import { expect } from "../../test/assert";
import { mockWalletService } from "../../test/mocks/wallet";
import { ValidatorResult } from "../core/definitions/validator-result";

import { CreateChannelInteractor } from "./create-channel.interactor";
import { CreateChannelValidator } from "./create-channel.validator";
import { CreateChannelOutput } from "./create-channel.out";
import { CreateChannelInput } from "./create-channel.in";

function isCreateChannelOutput(output: CreateChannelOutput): output is CreateChannelOutput {
  return (output as CreateChannelOutput) !== undefined;
}

describe("create channel interactor", () => {
  const validatorResult: ValidatorResult = { valid: true, error: null };

  let interactor: CreateChannelInteractor;
  let createChannelValidator: CreateChannelValidator;
  let errorFactory;

  beforeEach(() => {
    createChannelValidator = {
      validate: fake(() => {
        return validatorResult;
      }),
    };

    errorFactory = {
      getError: fake(() => new Error("error")),
    };

    interactor = TestEnvironment.createInstance(CreateChannelInteractor, [
      {
        name: "createChannelValidator",
        useValue: createChannelValidator,
      },
      {
        name: "walletService",
        useValue: mockWalletService,
      },
      {
        name: "errorFactory",
        useValue: errorFactory,
      },
    ]) as CreateChannelInteractor;
  });

  describe("execute", () => {
    it("should work", async () => {
      const request: CreateChannelInput = {
        chainId: 1337,
        publicIdentifier: "indraABC",
      };

      const response = await interactor.execute(request);
      const isCorrectResponse = isCreateChannelOutput(response);
      expect(isCorrectResponse).to.be.ok;
    });
  });
});
