import { BigNumber } from "@connext/types";
import {
  Balance,
  LinkedTransferState,
  TransferState,
  CoreTransferState,
  DEFAULT_TRANSFER_TIMEOUT,
  FullTransferState,
  LinkedTransferResolverEncoding,
  LinkedTransferStateEncoding,
  TransferName,
} from "@connext/vector-types";
import { utils } from "ethers";

import { getRandomBytes32 } from "../hexStrings";
import { hashTransferState } from "../transfers";

import { mkAddress, mkHash, mkBytes32 } from "./util";

const { keccak256, solidityPack } = utils;

export type PartialTransferOverrides = Partial<{ balance: Partial<Balance>; assetId: string }>;

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

export const createCoreTransferState = (overrides: Partial<CoreTransferState> = {}): CoreTransferState => {
  return {
    initialBalance: { to: [mkAddress("0xaa"), mkAddress("0xbbb")], amount: ["1", "0"] },
    assetId: mkAddress(),
    channelAddress: mkAddress("0xccc"),
    transferId: mkBytes32("0xeeefff"),
    transferDefinition: mkAddress("0xdef"),
    initialStateHash: mkBytes32("0xabcdef"),
    transferTimeout: "1",
    initiator: mkAddress("0xaa"),
    responder: mkAddress("0xbbb"),
    ...overrides,
  };
};

type TestLinkedTransferOptions = {
  balance: Balance;
  assetId: string;
  preImage: string;
  meta: any;
  channelFactoryAddress: string;
  chainId: number;
} & CoreTransferState;
export function createTestFullLinkedTransferState(
  overrides: Partial<TestLinkedTransferOptions> = {},
): FullTransferState<typeof TransferName.LinkedTransfer> {
  // get overrides/defaults values
  const { balance, assetId, preImage, meta, ...core } = overrides;

  const transferEncodings = [LinkedTransferStateEncoding, LinkedTransferResolverEncoding];
  const transferResolver = { preImage: preImage ?? getRandomBytes32() };
  const transferState = createTestLinkedTransferState({
    linkedHash: keccak256(solidityPack(["bytes32"], [transferResolver.preImage])),
    assetId: assetId ?? mkAddress(),
    balance: balance ?? { to: [mkAddress("0xaaa"), mkAddress("0xbbb")], amount: ["4", "0"] },
  });

  // get transfer value
  const transferValue = transferState.balance.amount.map((prev, curr) => {
    return BigNumber.from(prev).add(curr);
  }, BigNumber.from(0));

  // get default values
  const defaults = {
    assetId: assetId ?? mkAddress(),
    chainId: 2,
    channelAddress: mkAddress("0xccc"),
    channelFactoryAddress: mkAddress("0xaaaaddddffff"),
    initialBalance: { ...transferState.balance, amount: [transferValue.toString(), "0"] },
    initialStateHash: hashTransferState(transferState, transferEncodings[0]),
    meta: meta ?? { super: "cool stuff", routingId: mkHash("0xaabb") },
    transferDefinition: mkAddress("0xdef"),
    transferEncodings,
    transferId: getRandomBytes32(),
    transferResolver,
    transferState,
    transferTimeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
    initiator: transferState.balance.to[0],
    responder: transferState.balance.to[1],
  };

  return {
    ...defaults,
    ...core,
  };
}
