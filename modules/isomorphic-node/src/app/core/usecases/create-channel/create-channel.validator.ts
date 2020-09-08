import { Validator } from "../../definitions/validator";
import { ValidatorResult } from "../../definitions/validator-result";

import { CreateChannelInput } from "./create-channel.in";

export interface CreateChannelValidator extends Validator<CreateChannelInput> {
  validate(request: CreateChannelInput): ValidatorResult;
}
