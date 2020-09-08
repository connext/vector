import { fake } from "sinon";
import { constants } from "ethers";

import { TestEnvironment } from "../../../../test-environment";
import { expect } from "../../../../test/assert";
import { mockWalletService } from "../../../../test/mocks/wallet";
import { ValidatorResult } from "../../definitions/validator-result";

import { DepositInput } from "./deposit.in";
import { DepositUseCase } from "./deposit.usecase";
import { DepositOutput } from "./deposit.out";
import { DepositValidator } from "./deposit.validator";

function isDepositOutput(output: DepositOutput): output is DepositOutput {
  return (output as DepositOutput) !== undefined;
}

describe("deposit interactor", () => {
  const validatorResult: ValidatorResult = { valid: true, error: null };

  let interactor: DepositUseCase;
  let depositValidator: DepositValidator;

  beforeEach(() => {
    depositValidator = {
      validate: fake(() => {
        return validatorResult;
      }),
    };

    interactor = TestEnvironment.createInstance(DepositUseCase, [
      {
        name: "depositValidator",
        useValue: depositValidator,
      },
      {
        name: "walletService",
        useValue: mockWalletService,
      },
    ]) as DepositUseCase;
  });

  describe("execute", () => {
    it("should work", async () => {
      const request: DepositInput = {
        amount: constants.One,
        assetId: constants.AddressZero,
        channelId: constants.AddressZero,
      };

      const result = await interactor.execute(request);
      const isCorrectResponse = isDepositOutput(result);
      expect(isCorrectResponse).to.be.ok;
      expect(result.getValue()).to.be.ok;
    });
  });
});
