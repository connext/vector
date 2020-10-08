export type LockInformation = {
  type: "acquire" | "release";
  lockName: string;
  lockValue?: string;
};

export interface ILockService {
  acquireLock(
    lockName: string /* Bytes32? */,
    isAlice?: boolean,
    counterpartyPublicIdentifier?: string,
  ): Promise<string>;

  releaseLock(
    lockName: string /* Bytes32? */,
    lockValue: string,
    isAlice?: boolean,
    counterpartyPublicIdentifier?: string,
  ): Promise<void>;
}
