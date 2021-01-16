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
const CROSS_CHAIN_TRANSFER_LOCAL_STORAGE_KEY = "pendingCrossChainTransfers";

export async function getCrossChainTransfers(): Promise<StoredCrossChainTransfer[]> {
  const transfers = await Promise.all(
    Object.keys(window.localStorage).map(async (key) => {
      if (key.startsWith(CROSS_CHAIN_TRANSFER_LOCAL_STORAGE_KEY)) {
        return getCrossChainTransfer(key);
      }
      return undefined;
    }),
  );
  return transfers.filter((t) => !!t) as StoredCrossChainTransfer[];
}

export async function getCrossChainTransfer(
  crossChainTransferId: string,
): Promise<StoredCrossChainTransfer | undefined> {
  const retrieved = window.localStorage.getItem(crossChainTransferId);
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
  window.localStorage.setItem(`${CROSS_CHAIN_TRANSFER_LOCAL_STORAGE_KEY}_${crossChainTransferId}`, stringified);
}

export function removeCrossChainTransfer(crossChainTransferId: string): void {
  window.localStorage.removeItem(`${CROSS_CHAIN_TRANSFER_LOCAL_STORAGE_KEY}_${crossChainTransferId}`);
}
