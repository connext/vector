import {
  UpdateType,
  ChannelUpdate,
  ChannelUpdateDetailsMap,
  FullChannelState,
  UpdateParams,
  UpdateParamsMap,
  CreateUpdateDetails,
  DepositUpdateDetails,
  ResolveUpdateDetails,
  SetupUpdateDetails,
  LinkedTransferState,
} from "@connext/vector-types";

import { ChannelSigner } from "../channelSigner";

import { createTestLinkedTransferState } from "./transfers";
import { mkAddress, mkPublicIdentifier, mkBytes32, mkHash } from "./util";

// Helper partial types for test helpers
export type PartialChannelUpdate<T extends UpdateType> = Partial<
  Omit<ChannelUpdate<T>, "details"> & { details: Partial<ChannelUpdateDetailsMap[T]> }
>;

export type PartialFullChannelState<T extends UpdateType> = Partial<
  Omit<FullChannelState, "latestUpdate"> & { latestUpdate: PartialChannelUpdate<T> }
>;

export type PartialUpdateParams<T extends UpdateType> = Partial<
  Omit<UpdateParams<T>, "details"> & { details?: Partial<UpdateParamsMap[T]> }
>;

export function createTestUpdateParams<T extends UpdateType>(
  type: T,
  overrides: PartialUpdateParams<T>,
): UpdateParams<T> {
  const base = {
    channelAddress: overrides.channelAddress ?? mkAddress("ccc"),
    type,
  };

  let details: any;
  switch (type) {
    case UpdateType.setup:
      details = {
        counterpartyIdentifier: mkPublicIdentifier("0xbbb"),
        timeout: "1200",
        networkContext: {
          chainId: 2,
          providerUrl: "http://eth.com",
          channelFactoryAddress: mkAddress("ccccddddaaaaaffff"),
          channelMastercopyAddress: mkAddress("cccaaa"),
        },
      };
      break;
    case UpdateType.deposit:
      details = {
        channelAddress: base.channelAddress,
        assetId: mkAddress(),
      };
      break;
    case UpdateType.create:
      details = {
        channelAddress: base.channelAddress,
        amount: "15",
        assetId: mkAddress("0"),
        transferDefinition: mkAddress("def"),
        transferInitialState: createTestLinkedTransferState(),
        timeout: "1",
        encodings: ["state", "resolver"],
        meta: { test: "meta" },
      };
      break;
    case UpdateType.resolve:
      details = {
        channelAddress: base.channelAddress,
        transferId: mkBytes32("abcdef"),
        transferResolver: { preImage: mkBytes32("cdef") },
        meta: { test: "meta" },
      };
      break;
  }

  const { details: detailOverrides, ...defaultOverrides } = overrides;

  return {
    ...base,
    details: {
      ...details,
      channelAddress: base.channelAddress,
      ...(detailOverrides ?? {}),
    },
    ...defaultOverrides,
  };
}

export function createTestChannelUpdate<T extends UpdateType>(
  type: T,
  overrides: PartialChannelUpdate<T> = {},
): ChannelUpdate<T> {
  // Generate the base update values
  const baseUpdate = {
    assetId: mkAddress("0"),
    balance: {
      amount: ["1", "0"],
      to: [mkAddress("aaa"), mkAddress("bbb")],
    },
    channelAddress: mkAddress("ccc"),
    fromIdentifier: mkPublicIdentifier("A"),
    nonce: 1,
    signatures: [mkBytes32("abcd1"), mkBytes32("abcd2")],
    toIdentifier: mkPublicIdentifier("B"),
    type,
  };

  // Get details from overrides
  const { details: detailOverrides, ...defaultOverrides } = overrides;

  // Assign detail defaults based on update
  let details: CreateUpdateDetails | DepositUpdateDetails | ResolveUpdateDetails | SetupUpdateDetails;
  switch (type) {
    case UpdateType.setup:
      details = {
        networkContext: {
          chainId: 1337,
          channelFactoryAddress: mkAddress("ccccddddaaaaaffff"),
          providerUrl: "http://localhost:8545",
          channelMastercopyAddress: mkAddress("mast"),
        },
        timeout: "1",
      } as SetupUpdateDetails;
      break;
    case UpdateType.deposit:
      details = {
        latestDepositNonce: 1,
      } as DepositUpdateDetails;
      break;
    case UpdateType.create:
      details = {
        merkleProofData: [mkBytes32("beef")],
        merkleRoot: mkBytes32("feeb"),
        transferDefinition: mkAddress("def"),
        transferEncodings: ["create", "resolve"],
        transferId: mkBytes32("eee"),
        transferInitialState: {
          balance: {
            amount: ["10", "0"],
            to: [mkAddress("aaa"), mkAddress("bbb")],
          },
          linkedHash: mkBytes32("fabfab"),
        } as LinkedTransferState,
        transferTimeout: "0",
      } as CreateUpdateDetails;
      break;
    case UpdateType.resolve:
      details = {
        merkleRoot: mkBytes32("feeb"),
        transferDefinition: mkAddress("def"),
        transferEncodings: ["create", "resolve"],
        transferId: mkBytes32("eee"),
        transferResolver: { preImage: mkBytes32("eeefff") },
      } as ResolveUpdateDetails;
      break;
  }
  return {
    ...baseUpdate,
    details: {
      ...details,
      ...(detailOverrides ?? {}),
    },
    ...(defaultOverrides ?? {}),
  } as ChannelUpdate<T>;
}

export function createTestChannelState<T extends UpdateType = typeof UpdateType.setup>(
  type: T,
  overrides: PartialFullChannelState<T> = {},
): FullChannelState<T> {
  // Get some default values that should be consistent between
  // the channel state and the channel update
  const publicIdentifiers = overrides.publicIdentifiers ?? [mkPublicIdentifier("A"), mkPublicIdentifier("B")];
  const participants = overrides.participants ?? [mkAddress("aaa"), mkAddress("bbb")];
  const channelAddress = mkAddress("ccc");
  const assetIds = overrides.assetIds ?? [mkAddress("0"), mkAddress("1")];
  const nonce = overrides.nonce ?? 1;
  return {
    assetIds,
    balances: [
      // assetId0
      {
        amount: ["1", "2"],
        to: [...participants],
      },
      // assetId1
      {
        amount: ["1", "2"],
        to: [...participants],
      },
    ],
    lockedBalance: ["1", "2"],
    channelAddress,
    latestDepositNonce: 1,
    latestUpdate: createTestChannelUpdate(type, {
      channelAddress,
      fromIdentifier: publicIdentifiers[0],
      toIdentifier: publicIdentifiers[1],
      assetId: assetIds[0],
      nonce,
      ...(overrides.latestUpdate ?? {}),
    }) as any,
    merkleRoot: mkHash(),
    networkContext: {
      chainId: 1337,
      channelFactoryAddress: mkAddress("ccccddddaaaaaffff"),
      providerUrl: "http://localhost:8545",
      channelMastercopyAddress: mkAddress("mast"),
    },
    nonce,
    participants,
    publicIdentifiers,
    timeout: "1",
    ...overrides,
  };
}

export function createTestChannelStateWithSigners<T extends UpdateType = typeof UpdateType.setup>(
  signers: ChannelSigner[],
  type: T,
  overrides: PartialFullChannelState<T> = {},
): FullChannelState<T> {
  const publicIdentifiers = signers.map(s => s.publicIdentifier);
  const participants = signers.map(s => s.address);
  const signerOverrides = {
    publicIdentifiers,
    participants,
    ...(overrides ?? {}),
  };
  return createTestChannelState(type, signerOverrides) as FullChannelState<T>;
}

export function createTestChannelUpdateWithSigners<T extends UpdateType = typeof UpdateType.setup>(
  signers: ChannelSigner[],
  type: T,
  overrides: PartialChannelUpdate<T> = {},
): ChannelUpdate<T> {
  // The only update type where signers could matter
  // is when providing the transfer initial state to the
  // function
  const details: any = {};
  if (type === UpdateType.create) {
    details.transferInitialState = createTestLinkedTransferState({
      balance: {
        to: signers.map(s => s.address),
      },
      ...(((overrides as unknown) as ChannelUpdate<"create">).details.transferInitialState ?? {}),
    });
  }

  const signerOverrides = {
    balance: {
      to: signers.map(s => s.address),
      amount: ["1", "0"],
    },
    fromIdentifier: signers[0].publicIdentifier,
    toIdentifier: signers[1].publicIdentifier,
    ...(overrides ?? {}),
  };

  return createTestChannelUpdate(type, signerOverrides);
}
