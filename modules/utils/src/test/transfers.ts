import {
  Balance,
  LinkedTransferState,
  TransferState,
  CoreTransferState,
  LinkedTransferStateEncoding,
  LinkedTransferResolverEncoding,
} from "@connext/vector-types";

import { mkAddress, mkHash, mkBytes32 } from "./util";

type PartialTransferOverrides = Partial<{ balance: Partial<Balance>; assetId: string }>;

export const createTestLinkedTransferState = (
  overrides: PartialTransferOverrides & { linkedHash?: string } = {},
): LinkedTransferState => {
  const { balance: balanceOverrides, ...defaultOverrides } = overrides;
  return {
    balance: {
      to: [mkAddress("0xaaa"), mkAddress("0xbbb")],
      amount: ["1", "0"],
      ...(balanceOverrides ?? {}),
    },
    linkedHash: mkHash("0xeee"),
    ...defaultOverrides,
  };
};

export const createTestLinkedTransferStates = (
  count = 2,
  overrides: PartialTransferOverrides[] = [],
): TransferState[] => {
  return Array(count)
    .fill(0)
    .map((val, idx) => {
      return createTestLinkedTransferState({ ...(overrides[idx] ?? {}) });
    });
};

export function createCoreTransferState(overrides: Partial<CoreTransferState> = {}): CoreTransferState {
  // TODO: make dependent on transfer def/name
  return {
    initialBalance: { to: [mkAddress("0xaa"), mkAddress("0xbbb")], amount: ["1", "0"] },
    assetId: mkAddress(),
    channelAddress: mkAddress("0xccc"),
    transferId: mkBytes32("0xeeefff"),
    transferDefinition: mkAddress("0xdef"),
    transferEncodings: [LinkedTransferStateEncoding, LinkedTransferResolverEncoding],
    initialStateHash: mkBytes32("0xabcdef"),
    transferTimeout: "1",
    ...overrides,
  };
}
