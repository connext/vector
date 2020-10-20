import {
  TransferState,
  CoreTransferState,
  DEFAULT_TRANSFER_TIMEOUT,
  FullTransferState,
  HashlockTransferState,
  HashlockTransferStateEncoding,
  HashlockTransferResolverEncoding,
} from "@connext/vector-types";
import { utils } from "ethers";

import { getRandomBytes32 } from "../hexStrings";
import { hashTransferState } from "../transfers";

import { mkAddress, mkHash, mkBytes32 } from "./util";

const { keccak256, solidityPack } = utils;

export const createTestHashlockTransferState = (overrides: Partial<HashlockTransferState> = {}): TransferState => {
  return {
    lockHash: mkHash("0xeee"),
    expiry: "0",
    ...overrides,
  };
};

export const createTestHashlockTransferStates = (
  count = 2,
  overrides: Partial<HashlockTransferState>[] = [],
): TransferState[] => {
  return Array(count)
    .fill(0)
    .map((val, idx) => {
      return createTestHashlockTransferState({ ...(overrides[idx] ?? {}) });
    });
};

export const createCoreTransferState = (overrides: Partial<CoreTransferState> = {}): CoreTransferState => {
  return {
    balance: { to: [mkAddress("0xaa"), mkAddress("0xbbb")], amount: ["1", "0"] },
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

type TestHashlockTransferOptions = {
  assetId: string;
  preImage: string;
  expiry: string;
  meta: any;
  channelFactoryAddress: string;
  chainId: number;
} & CoreTransferState;

export function createTestFullHashlockTransferState(
  overrides: Partial<TestHashlockTransferOptions> = {},
): FullTransferState {
  // get overrides/defaults values
  const { assetId, preImage, expiry, meta, ...core } = overrides;

  // Taken from onchain defs
  const transferEncodings = [HashlockTransferStateEncoding, HashlockTransferResolverEncoding];
  const transferResolver = { preImage: preImage ?? getRandomBytes32() };
  const transferState = createTestHashlockTransferState({
    lockHash: keccak256(solidityPack(["bytes32"], [transferResolver.preImage])),
    expiry: expiry ?? "0",
  });

  // get default values
  const defaults = {
    assetId: assetId ?? mkAddress(),
    chainId: 2,
    channelAddress: mkAddress("0xccc"),
    channelFactoryAddress: mkAddress("0xaaaaddddffff"),
    balance: overrides.balance ?? { to: [mkAddress("0x111"), mkAddress("0x222")], amount: ["13", "0"] },
    initialStateHash: hashTransferState(transferState, transferEncodings[0]),
    meta: meta ?? { super: "cool stuff", routingId: mkHash("0xaabb") },
    transferDefinition: mkAddress("0xdef"),
    transferEncodings,
    transferId: getRandomBytes32(),
    transferResolver,
    transferState,
    transferTimeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
    initiator: overrides.balance?.to[0] ?? mkAddress("0x111"),
    responder: overrides.balance?.to[1] ?? mkAddress("0x222"),
  };

  return {
    ...defaults,
    ...core,
  };
}
