export type CrossChainTransferParams = {
  amount: string;
  fromChainId: number;
  fromAssetId: string;
  toChainId: number;
  toAssetId: string;
  reconcileDeposit: boolean;
  withdrawalAddress?: string;
};

export const CrossChainTransferStatus = {
  INITIAL: "INITIAL",
  DEPOSITED: "DEPOSITED",
  ERROR: "ERROR",
} as const;
export type CrossChainTransferStatus = keyof typeof CrossChainTransferStatus;

const CROSS_CHAIN_TRANSFER_LOCAL_STORAGE_KEY = "crossChainTransfer";

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
  window.localStorage.setItem(CROSS_CHAIN_TRANSFER_LOCAL_STORAGE_KEY, stringified);
}
