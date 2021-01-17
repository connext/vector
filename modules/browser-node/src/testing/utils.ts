import { getRandomBytes32, mkAddress } from "@connext/vector-utils";

import {
  CrossChainTransferParams,
  CrossChainTransferStatus,
  StoredCrossChainTransfer,
} from "../services/crossChainTransferStore";

export const createTestCrossChainTransferParams = (
  overrides: Partial<CrossChainTransferParams> = {},
): CrossChainTransferParams => {
  return {
    amount: "1234567",
    fromChainId: 1337,
    fromAssetId: mkAddress("0x1337A"),
    toChainId: 1338,
    toAssetId: mkAddress("0x1338A"),
    reconcileDeposit: true,
    error: false,
    withdrawalAddress: mkAddress("0xabc"),
    preImage: getRandomBytes32(),
    withdrawalAmount: "1234567",
    ...overrides,
  };
};

export const createTestStoredCrossChainTransfer = (
  overrides: Partial<StoredCrossChainTransfer> = {},
): StoredCrossChainTransfer => {
  const { status, crossChainTransferId, ...paramOverrides } = overrides;
  return {
    status: status ?? CrossChainTransferStatus.INITIAL,
    crossChainTransferId: crossChainTransferId ?? getRandomBytes32(),
    ...createTestCrossChainTransferParams(paramOverrides),
  };
};
