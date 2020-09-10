import { UseCaseError } from "../../../definitions/use-case-error";

export class DepositInvalidRequest extends UseCaseError {
  constructor(requestPayload: unknown) {
    super(`request '${JSON.stringify(requestPayload)}' is not valid`);
  }
}
