import {
  FullChannelState,
  ChannelUpdate,
  UpdateType,
  CreateUpdateDetails,
  DepositUpdateDetails,
  ResolveUpdateDetails,
  SetupUpdateDetails,
  LinkedTransferState,
} from "@connext/vector-types";

import { Balance, TransferState } from "../../types/dist/src";

import { ChannelSigner } from "./channelSigner";

export const mkAddress = (prefix = "0xa"): string => {
  return prefix.padEnd(42, "0");
};

export const mkPublicIdentifier = (prefix = "indraA"): string => {
  return prefix.padEnd(55, "0");
};

export const mkHash = (prefix = "0x"): string => {
  return prefix.padEnd(66, "0");
};

export const mkBytes32 = (prefix = "0xa"): string => {
  return prefix.padEnd(66, "0");
};

export function createTestChannelUpdate<T extends UpdateType>(
  type: T,
  overrides: Partial<ChannelUpdate<T>> = {},
): ChannelUpdate<T> {
  // Generate the base update values
  const baseUpdate = {
    assetId: mkAddress("0x0"),
    balance: {
      amount: ["1", "0"],
      to: [mkAddress("0xaaa"), mkAddress("0xbbb")],
    },
    channelAddress: mkAddress("0xccc"),
    fromIdentifier: mkPublicIdentifier("indraA"),
    nonce: 2,
    signatures: [mkBytes32("0xsig1"), mkBytes32("0xsig2")],
    toIdentifier: mkPublicIdentifier("indraB"),
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
          adjudicatorAddress: mkAddress("0xadj"),
          chainId: 1337,
          channelFactoryAddress: mkAddress("0xcha"),
          providerUrl: "http://localhost:8545",
          vectorChannelMastercopyAddress: mkAddress("0xmast"),
        },
        timeout: "0",
      } as SetupUpdateDetails;
      break;
    case UpdateType.deposit:
      details = {
        latestDepositNonce: 1,
      } as DepositUpdateDetails;
      break;
    case UpdateType.create:
      details = {
        merkleProofData: mkBytes32("0xproof"),
        merkleRoot: mkBytes32("0xroot"),
        transferDefinition: mkAddress("0xdef"),
        transferEncodings: ["create", "resolve"],
        transferId: mkBytes32("id"),
        transferInitialState: {},
        transferTimeout: "0",
      } as CreateUpdateDetails;
      break;
    case UpdateType.resolve:
      details = {
        merkleProofData: mkBytes32("0xproof1"),
        merkleRoot: mkBytes32("0xroot1"),
        transferDefinition: mkAddress("0xdef"),
        transferEncodings: ["create", "resolve"],
        transferId: mkBytes32("id"),
        transferResolver: { preImage: mkBytes32("0xpre") },
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

export const createTestChannelState = (
  type: UpdateType = "setup",
  overrides: Partial<FullChannelState<typeof type>> = {},
): FullChannelState<typeof type> => {
  // Get some default values that should be consistent between
  // the channel state and the channel update
  const publicIdentifiers = overrides.publicIdentifiers ?? [mkPublicIdentifier("indraA"), mkPublicIdentifier("indraB")];
  const participants = overrides.participants ?? [mkAddress("0xaaa"), mkAddress("0xbbb")];
  const channelAddress = mkAddress("0xccc");
  const assetIds = overrides.assetIds ?? [mkAddress("0x0"), mkAddress("0x1")];
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
    lockedValue: [
      {
        amount: "1",
      },
      {
        amount: "2",
      },
    ],
    channelAddress,
    latestDepositNonce: 1,
    latestUpdate: createTestChannelUpdate(type, {
      channelAddress,
      fromIdentifier: publicIdentifiers[0],
      toIdentifier: publicIdentifiers[1],
      assetId: assetIds[0],
      ...(overrides.latestUpdate ?? {}),
    }),
    merkleRoot: mkHash(),
    networkContext: {
      adjudicatorAddress: mkAddress("0xadj"),
      chainId: 1337,
      channelFactoryAddress: mkAddress("0xcha"),
      providerUrl: "http://localhost:8545",
      vectorChannelMastercopyAddress: mkAddress("0xmast"),
    },
    nonce: 2,
    participants,
    publicIdentifiers,
    timeout: "1",
    ...overrides,
  };
};

export const createTestChannelStateWithSigners = (
  signers: ChannelSigner[],
  type: UpdateType = "setup",
  overrides: Partial<FullChannelState<typeof type>> = {},
): FullChannelState<typeof type> => {
  const publicIdentifiers = signers.map((s) => s.publicIdentifier);
  const participants = signers.map((s) => s.address);
  const signerOverrides = {
    publicIdentifiers,
    participants,
    ...(overrides ?? {}),
  };
  return createTestChannelState(type, signerOverrides);
};

export const createTestChannelUpdateWithSigners = (
  signers: ChannelSigner[],
  type: UpdateType = "setup",
  overrides: Partial<ChannelUpdate<typeof type>> = {},
): ChannelUpdate<typeof type> => {
  // The only update type where signers could matter
  // is when providing the transfer initial state to the
  // function
  const details: any = {};
  if (type === UpdateType.create) {
    details.transferInitialState = createTestLinkedTransferState({
      balance: {
        to: signers.map((s) => s.address),
      },
      ...((overrides as ChannelUpdate<"create">).details.transferInitialState ?? {}),
    });
  }

  const signerOverrides = {
    balance: {
      to: signers.map((s) => s.address),
      amount: ["1", "0"],
    },
    fromIdentifier: signers[0].publicIdentifier,
    toIdentifier: signers[1].publicIdentifier,
    ...(overrides ?? {}),
  };

  return createTestChannelUpdate(type, signerOverrides);
};

export const createTestLinkedTransferState = (
  overrides: Partial<{ balance: Partial<Balance>; assetId: string }> = {},
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
  overrides: Partial<{ amount: string; assetId: string }>[] = [],
): TransferState[] => {
  return Array(count)
    .fill(0)
    .map((val, idx) => {
      return createTestLinkedTransferState({ ...(overrides[idx] ?? {}) });
    });
};
