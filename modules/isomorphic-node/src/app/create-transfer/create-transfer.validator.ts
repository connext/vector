import { Validator } from '../core/definitions/validator';
import { ValidatorResult } from '../core/definitions/validator-result';

import { CreateTransferInput } from './create-transfer.in';

export interface CreateTransferValidator extends Validator<CreateTransferInput> {
  validate(request: CreateTransferInput): ValidatorResult;
}
