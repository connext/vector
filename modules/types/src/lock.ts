export interface ILockService {
  acquireLock(
    lockName: string /* Bytes32? */,
  ): Promise<string>;

  releaseLock(
    lockName: string /* Bytes32? */,
    lockValue: string,
  ): Promise<void>;
}