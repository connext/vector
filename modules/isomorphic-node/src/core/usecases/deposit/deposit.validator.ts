import { Validator } from "../../definitions/validator";
import { ValidatorResult } from "../../definitions/validator-result";

import { DepositInput } from "./deposit.in";

export interface DepositValidator extends Validator<DepositInput> {
  validate(request: DepositInput): ValidatorResult;
}
