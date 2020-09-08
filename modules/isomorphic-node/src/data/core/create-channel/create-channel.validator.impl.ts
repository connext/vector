import Joi from "joi";

import { ValidatorResult } from "../../../core/definitions/validator-result";
import { CreateChannelInput } from "../../../core/usecases/create-channel/create-channel.in";
import { CreateChannelValidator } from "../../../core/usecases/create-channel/create-channel.validator";

export class CreateChannelValidatorImpl implements CreateChannelValidator {
  private joi: typeof Joi;
  private schema: Joi.ObjectSchema;

  constructor(joi: typeof Joi) {
    this.joi = joi;
    this.schema = this.joi.object().keys({
      publicIdentifier: this.joi.string().required(),
      chainId: this.joi.number().integer().min(1).required(),
    });
  }

  validate(request: CreateChannelInput): ValidatorResult {
    const joiResult = this.joi.attempt(request, this.schema);
    return { valid: joiResult.error === null, error: joiResult.error };
  }
}
