import { UseCaseError } from "../../../definitions/use-case-error";

export class WalletError extends UseCaseError {
  constructor(message: string) {
    super(`Generic wallet error: ${message}`);
  }
}
