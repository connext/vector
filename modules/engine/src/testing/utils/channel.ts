import { FullChannelState, ChannelUpdate, UpdateType, TransferState, ChannelUpdateDetailsMap, NetworkContext } from "@connext/vector-types";
import { ChannelSigner, getRandomChannelSigner } from "@connext/vector-utils";
import { config } from "chai";
import { constants } from "ethers";

import { mkAddress, mkHash } from "./chain";

export const emptyUpdate = (signers: ChannelSigner[]): ChannelUpdate<any> => {
  return {
    assetId: constants.AddressZero,
    balance: {
      amount: ["0", "0"],
      to: [signers[0].address, signers[1].address],
    },
    channelAddress: mkAddress("0xc"),
    details: {},
    fromIdentifier: signers[0].publicIdentifier,
    nonce: 1,
    signatures: [mkHash("0xe"), mkHash("0xe")],
    toIdentifier: signers[1].publicIdentifier,
    type: UpdateType.setup,
  };
};

export const createTestNetworkContext = (overrides: Partial<NetworkContext> = {}): NetworkContext => {
  return {
    chainId: 1341,
    vectorChannelMastercopyAddress: mkAddress("0xa"),
    channelFactoryAddress: mkAddress("0xb"),
    adjudicatorAddress: mkAddress("0xc"),
    providerUrl: "http://localhost:8545",
    ...overrides,
  };
};

export function createTestChannelUpdate<T extends UpdateType>(
  signers: ChannelSigner[] = [getRandomChannelSigner(), getRandomChannelSigner()],
  overrides: Partial<Omit<ChannelUpdate<T>, "details"> & { details?: Partial<ChannelUpdateDetailsMap[T]> }> = {},
): ChannelUpdate<T> {
  return {
    ...emptyUpdate(signers),
    ...overrides,
  };
}

export function createTestChannelState<T extends UpdateType>(
  signers: ChannelSigner[] = [getRandomChannelSigner(), getRandomChannelSigner()],
  overrides: Partial<FullChannelState<T>> = {},
): FullChannelState<T> {
  const latestUpdate = createTestChannelUpdate(signers, overrides.latestUpdate ?? {});
  return {
    ...emptyChannel(signers),
    latestUpdate,
    ...overrides,
  };
}

export const emptyChannel = (signers: ChannelSigner[]): FullChannelState<any> => {
  return {
    publicIdentifiers: signers.map((s) => s.publicIdentifier),
    latestUpdate: undefined,
    networkContext: {
      ...createTestNetworkContext(),
      ...config, // TODO: will config be inline?
    },
    channelAddress: mkAddress("0xc"),
    participants: signers.map((s) => s.address),
    timeout: "0",
    balances: [],
    lockedValue: [],
    assetIds: [],
    nonce: 0,
    latestDepositNonce: 0,
    merkleRoot: mkHash(),
  };
};

export const createTestTransferState = (
  signers: ChannelSigner[] = [getRandomChannelSigner(), getRandomChannelSigner()],
  overrides: Partial<{ amount: string; assetId: string }> = {},
): TransferState => {
  return {
    balance: { to: signers.map((s) => s.address), amount: [overrides.amount ?? "1", "0"] },
    assetId: overrides.assetId ?? mkAddress(),
  };
};

export const createTestTransferStates = (
  count = 2,
  signers: ChannelSigner[] = [getRandomChannelSigner(), getRandomChannelSigner()],
  overrides: Partial<{ amount: string; assetId: string }>[] = [],
): TransferState[] => {
  return Array(count)
    .fill(0)
    .map((val, idx) => {
      return createTestTransferState(signers, { ...(overrides[idx] ?? {}) });
    });
};
