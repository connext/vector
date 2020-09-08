import { Validator } from "../../definitions/validator";
import { ValidatorResult } from "../../definitions/validator-result";

import { CreateTransferInput } from "./create-transfer.in";

export interface CreateTransferValidator extends Validator<CreateTransferInput> {
  validate(request: CreateTransferInput): ValidatorResult;
}
