export class InvalidTransferType extends Error {
  constructor(transferType: string) {
    super(`Transfer type ${transferType} invalid`);
  }
}
