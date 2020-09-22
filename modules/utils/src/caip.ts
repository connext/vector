import { AccountID, ChainID, ChainIDParams } from "caip";

const EIP155_NAMESPACE = "eip155";

export const parseChainId = (chainId: string | ChainIDParams): number => {
  if (typeof chainId === "string") {
    chainId = ChainID.parse(chainId);
  }
  if (chainId.namespace !== EIP155_NAMESPACE) {
    throw new Error("ChainId provided namespace does not match EIP155");
  }
  return Number(chainId.reference);
};

export const formatAssetId = (assetAddress: string, chainId: number): string => {
  return AccountID.format({ address: assetAddress, chainId: { namespace: EIP155_NAMESPACE, reference: `${chainId}` } });
};

export const parseAssetId = (assetId: string): { assetAddress: string; chainId: number } => {
  const accountId = AccountID.parse(assetId);
  return { assetAddress: accountId.address, chainId: parseChainId(accountId.chainId) };
};
