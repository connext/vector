import {
  FullChannelState,
  ChannelUpdate,
  UpdateType,
  CreateUpdateDetails,
  DepositUpdateDetails,
  ResolveUpdateDetails,
  SetupUpdateDetails,
} from "@connext/vector-types";

export const mkAddress = (prefix = "0xa"): string => {
  return prefix.padEnd(42, "0");
};

export const mkPublicIdentifier = (prefix = "indraA"): string => {
  return prefix.padEnd(55, "0");
};

export const mkBytes32 = (prefix = "0xa"): string => {
  return prefix.padEnd(66, "0");
};

export const createTestChannelUpdate = (
  type: UpdateType = "setup",
  overrides: Partial<ChannelUpdate<typeof type>> = {},
): ChannelUpdate<typeof type> => {
  let details: CreateUpdateDetails | DepositUpdateDetails | ResolveUpdateDetails | SetupUpdateDetails;
  switch (type) {
    case "setup":
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
    case "deposit":
      details = {
        latestDepositNonce: 1,
      } as DepositUpdateDetails;
      break;
    case "create":
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
    case "resolve":
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
    assetId: mkAddress("0xa"),
    balance: {
      amount: ["1", "0"],
      to: [mkAddress("0xaaa"), mkAddress("0xbbb")],
    },
    channelAddress: mkAddress("0xcha"),
    details,
    fromIdentifier: mkPublicIdentifier("indraA"),
    nonce: 2,
    signatures: [mkBytes32("0xsig1"), mkBytes32("0xsig2")],
    toIdentifier: mkPublicIdentifier("indraB"),
    type: "create",
    ...overrides,
  };
};

export const createTestChannelState = (
  type: UpdateType = "setup",
  overrides: Partial<FullChannelState<typeof type>> = {},
): FullChannelState<typeof type> => {
  return {
    assetIds: [mkAddress("0x0"), mkAddress("0x1")],
    balances: [
      // assetId0
      {
        amount: ["1", "2"],
        to: [mkAddress("0xaaa"), mkAddress("0xbbb")],
      },
      // assetId1
      {
        amount: ["1", "2"],
        to: [mkAddress("0xaaa"), mkAddress("0xbbb")],
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
    channelAddress: mkAddress("0xchan"),
    latestDepositNonce: 1,
    latestUpdate: createTestChannelUpdate(type, overrides.latestUpdate),
    merkleRoot: "0x",
    networkContext: {
      adjudicatorAddress: mkAddress("0xadj"),
      chainId: 1337,
      channelFactoryAddress: mkAddress("0xcha"),
      providerUrl: "http://localhost:8545",
      vectorChannelMastercopyAddress: mkAddress("0xmast"),
    },
    nonce: 2,
    participants: [mkAddress("0xaaa"), mkAddress("0xbbb")],
    publicIdentifiers: [mkPublicIdentifier("indraA"), mkPublicIdentifier("indraB")],
    timeout: "1",
    ...overrides,
  };
};
