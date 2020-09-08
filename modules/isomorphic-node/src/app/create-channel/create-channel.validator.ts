import { Validator } from "../core/definitions/validator";
import { ValidatorResult } from "../core/definitions/validator-result";

import { CreateChannelInput } from "./create-channel.in";

export interface CreateChannelValidator extends Validator<CreateChannelInput> {
  validate(request: CreateChannelInput): ValidatorResult;
}
