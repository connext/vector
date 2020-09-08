import { fake } from "sinon";
import { constants } from "ethers";

import { TestEnvironment } from "../../test-environment";
import { expect } from "../../test/assert";
import { mockWalletService } from "../../test/mocks/wallet";
import { ValidatorResult } from "../core/definitions/validator-result";

import { DepositInput } from "./deposit.in";
import { DepositInteractor } from "./deposit.interactor";
import { DepositOutput } from "./deposit.out";
import { DepositValidator } from "./deposit.validator";

function isDepositOutput(output: DepositOutput): output is DepositOutput {
  return (output as DepositOutput) !== undefined;
}

describe("deposit interactor", () => {
  const validatorResult: ValidatorResult = { valid: true, error: null };

  let interactor: DepositInteractor;
  let depositValidator: DepositValidator;
  let errorFactory;

  beforeEach(() => {
    depositValidator = {
      validate: fake(() => {
        return validatorResult;
      }),
    };

    errorFactory = {
      getError: fake(() => new Error("error")),
    };

    interactor = TestEnvironment.createInstance(DepositInteractor, [
      {
        name: "depositValidator",
        useValue: depositValidator,
      },
      {
        name: "walletService",
        useValue: mockWalletService,
      },
      {
        name: "errorFactory",
        useValue: errorFactory,
      },
    ]) as DepositInteractor;
  });

  describe("execute", () => {
    it("should work", async () => {
      const request: DepositInput = {
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
