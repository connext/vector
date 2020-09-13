import { GenericError } from "@connext/vector-types";

export class InvalidTransferType extends GenericError {
  constructor(transferType: string) {
    super(`Transfer type ${transferType} invalid`);
  }
}
