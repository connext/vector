import {
  Balance,
  LinkedTransferState,
  TransferState,
  CoreTransferState,
  FullTransferState,
  TransferName,
} from "@connext/vector-types";

import { mkAddress, mkHash, mkBytes32 } from "./util";

type PartialTransferOverrides = Partial<{ balance: Partial<Balance>; assetId: string }>;

export const createTestLinkedTransferState = (
  overrides: PartialTransferOverrides & { linkedHash?: string } = {},
): LinkedTransferState => {
  const { balance: balanceOverrides, ...defaultOverrides } = overrides;
  return {
    balance: {
      to: [mkAddress("aaa"), mkAddress("bbb")],
      amount: ["1", "0"],
      ...(balanceOverrides ?? {}),
    },
    linkedHash: mkHash("eee"),
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

export const createCoreTransferState = (overrides: Partial<CoreTransferState> = {}): CoreTransferState => {
  return {
    initialBalance: { to: [mkAddress("aa"), mkAddress("bbb")], amount: ["1", "0"] },
    assetId: mkAddress(),
    channelAddress: mkAddress("ccc"),
    transferId: mkBytes32("eeefff"),
    transferDefinition: mkAddress("def"),
    initialStateHash: mkBytes32("abcdef"),
    transferTimeout: "1",
    ...overrides,
  };
};

// export const createFullTransferState = <T extends TransferName = any>(type: TransferName): FullTransferState<T> => {
//   let transferState;
//   switch (type) {
//     case "LinkedTransfer":
//       transferState = createTestLinkedTransferState();
//       break;
//     case "Withdraw":
//       break;
//   }
//   return {
//     factoryAddress: mkAddress("aaaddd"),
//     chainId,
//     transferEncodings,
//     transferState,
//     transferResolver,
//     meta,
//     ...createCoreTransferState(),
//   };
// };
