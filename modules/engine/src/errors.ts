export class InvalidTransferType extends Error {
  constructor(transferType: string) {
    super(`Transfer type ${transferType} invalid`);
  }
}

export class EngineError extends Error {
  constructor(public readonly msg: string, public readonly context: any = {}) {
    super(msg);
  }
}
