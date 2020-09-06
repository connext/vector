import { CustomError } from '../../../app/core/definitions/custom-error';

export class CreateChannelErrorImpl extends CustomError {
  name = 'createChannelError';

  constructor() {
    super();
  }

  toString(): string {
    return `${this.name}:
    ${this.data}`;
  }
}
