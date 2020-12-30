export type CrossChainTransferParams = {
  amount: string;
  fromChainId: number;
  fromAssetId: string;
  toChainId: number;
  toAssetId: string;
  reconcileDeposit: boolean;
  error: boolean;
  withdrawalAddress?: string;
};

export const CrossChainTransferStatus = {
  INITIAL: 0,
  DEPOSITED: 1,
  TRANSFER_1: 2,
  TRANSFER_2: 3,
} as const;
export type CrossChainTransferStatus = keyof typeof CrossChainTransferStatus;

export type StoredCrossChainTransfer = CrossChainTransferParams & {
  status: CrossChainTransferStatus;
  crossChainTransferId: string;
};

const CROSS_CHAIN_TRANSFER_LOCAL_STORAGE_KEY = "crossChainTransfer";

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

export async function saveCrossChainTransfer(
  crossChainTransferId: string,
  status: CrossChainTransferStatus,
  params: CrossChainTransferParams,
): Promise<void> {
  const stringified = JSON.stringify({
    crossChainTransferId,
    status,
    ...params,
  });
  window.localStorage.setItem(`${CROSS_CHAIN_TRANSFER_LOCAL_STORAGE_KEY}_${crossChainTransferId}`, stringified);
}

export async function removeCrossChainTransfer(crossChainTransferId: string): Promise<void> {
  window.localStorage.removeItem(`${CROSS_CHAIN_TRANSFER_LOCAL_STORAGE_KEY}_${crossChainTransferId}`);
}
