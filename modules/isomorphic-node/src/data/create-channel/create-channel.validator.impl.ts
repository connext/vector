import Joi from "joi";

import { ValidatorResult } from "../../app/core/definitions/validator-result";
import { CreateChannelInput } from "../../app/core/usecases/create-channel/create-channel.in";
import { CreateChannelValidator } from "../../app/core/usecases/create-channel/create-channel.validator";

export class CreateChannelValidatorImpl implements CreateChannelValidator {
  private joi: typeof Joi;
  private schema: Joi.ObjectSchema;

  constructor(joi: typeof Joi) {
    this.joi = joi;
    this.schema = this.joi.object().keys({
      userId: this.joi.alternatives().try(joi.string(), joi.number()),
      value: this.joi.number().min(10).max(1000).required(),
    });
  }

  validate(request: CreateChannelInput): ValidatorResult {
    const joiResult = this.joi.attempt(request, this.schema);
    return { valid: joiResult.error === null, error: joiResult.error };
  }
}
