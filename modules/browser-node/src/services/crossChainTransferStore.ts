import { safeJsonParse } from "@connext/vector-utils";

export type CrossChainTransferParams = {
  amount: string;
  fromChainId: number;
  fromAssetId: string;
  toChainId: number;
  toAssetId: string;
  reconcileDeposit: boolean;
  error: boolean;
  withdrawalAddress?: string;
  preImage?: string;
  withdrawalAmount?: string;
};

export const CrossChainTransferStatus = {
  INITIAL: 0,
  DEPOSITED: 1,
  TRANSFER_1: 2,
  TRANSFER_2: 3,
} as const;

export type StoredCrossChainTransfer = CrossChainTransferParams & {
  status: number;
  crossChainTransferId: string;
};

// const OLD_CROSS_CHAIN_TRANSFER_LOCAL_STORAGE_KEY = "crossChainTransfer";
export const CROSS_CHAIN_TRANSFER_LOCAL_STORAGE_KEY = "pendingCrossChainTransfers";
const getLocalStorageKey = (crossChainTransferId: string): string =>
  `${CROSS_CHAIN_TRANSFER_LOCAL_STORAGE_KEY}_${crossChainTransferId}`;

export function getCrossChainTransfers(): StoredCrossChainTransfer[] {
  const transfers = Object.keys(window.localStorage).map((key) => {
    if (key.startsWith(CROSS_CHAIN_TRANSFER_LOCAL_STORAGE_KEY)) {
      return window.localStorage.getItem(key);
    }
    return undefined;
  });
  return transfers.filter((t) => !!t).map((t) => safeJsonParse(t)) as StoredCrossChainTransfer[];
}

export function getCrossChainTransfer(crossChainTransferId: string): StoredCrossChainTransfer | undefined {
  const retrieved = window.localStorage.getItem(getLocalStorageKey(crossChainTransferId));
  if (retrieved) {
    return JSON.parse(retrieved);
  }
  return undefined;
}

export function saveCrossChainTransfer(
  crossChainTransferId: string,
  status: number,
  params: CrossChainTransferParams,
): void {
  const stringified = JSON.stringify({
    crossChainTransferId,
    status,
    ...params,
  });
  window.localStorage.setItem(getLocalStorageKey(crossChainTransferId), stringified);
}

export function removeCrossChainTransfer(crossChainTransferId: string): void {
  window.localStorage.removeItem(getLocalStorageKey(crossChainTransferId));
}
