export class UseCaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.getErrorType();
  }

  private getErrorType(): string {
    return this.constructor.name.toUpperCase();
  }
}
