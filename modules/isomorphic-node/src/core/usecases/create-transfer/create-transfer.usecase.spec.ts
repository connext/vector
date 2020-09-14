import { fake } from "sinon";
import { constants } from "ethers";
import { getRandomIdentifier } from "@connext/vector-utils";

import { TestEnvironment } from "../../../test-environment";
import { expect } from "../../../test/assert";
import { mockWalletService } from "../../../test/mocks/wallet";
import { ValidatorResult } from "../../definitions/validator-result";

import { CreateTransferValidator } from "./create-transfer.validator";
import { CreateTransferUseCase } from "./create-transfer.usecase";
import { CreateTransferInput } from "./create-transfer.in";
import { CreateTransferOutput } from "./create-transfer.out";

function isCreateTransferOutput(output: CreateTransferOutput): output is CreateTransferOutput {
  return (output as CreateTransferOutput) !== undefined;
}

describe("create transfer usecase", () => {
  const validatorResult: ValidatorResult = { valid: true, error: null };

  let useCase: CreateTransferUseCase;
  let createTransferValidator: CreateTransferValidator;

  beforeEach(() => {
    createTransferValidator = {
      validate: fake(() => {
        return validatorResult;
      }),
    };

    useCase = TestEnvironment.createInstance(CreateTransferUseCase, [
      {
        name: "createTransferValidator",
        useValue: createTransferValidator,
      },
      {
        name: "walletService",
        useValue: mockWalletService,
      },
    ]) as CreateTransferUseCase;
  });

  describe("execute", () => {
    it("should work", async () => {
      const request: CreateTransferInput = {
        amount: "1",
        assetId: constants.AddressZero,
        channelId: constants.AddressZero,
        routingId: constants.HashZero,
        preImage: constants.HashZero,
        meta: {},
        recipient: getRandomIdentifier(),
      };

      const result = await useCase.execute(request);
      const isCorrectResponse = isCreateTransferOutput(result);
      expect(isCorrectResponse).to.be.ok;
      expect(result.getValue()).to.be.ok;
    });
  });
});
