import { UseCaseError } from "../../../definitions/use-case-error";

export class CreateChannelInvalidRequest extends UseCaseError {
  constructor(requestPayload: unknown) {
    super(`request '${JSON.stringify(requestPayload)}' is not valid`);
  }
}
