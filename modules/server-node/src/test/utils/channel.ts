import { FullChannelState, ChannelUpdate } from "@connext/vector-types";

export const createTestChannelUpdate = (): ChannelUpdate<"create"> => {
  return {
    assetId: "0x0000000000000000000000000000000000000000",
    balance: {
      amount: ["1", "0"],
      to: ["0xaa00000000000000000000000000000000000000", "0xbb00000000000000000000000000000000000000"],
    },
    channelAddress: "0x1110000000000000000000000000000000000000",
    details: {
      merkleProofData: "0x",
      merkleRoot: "0x",
      transferDefinition: "0x0000000000000000000000000000000000000000",
      transferEncodings: [""],
      transferId: "0x",
      transferInitialState: {},
      transferTimeout: "1",
    },
    fromIdentifier: "indraABC",
    nonce: 2,
    signatures: ["0xa", "0xb"],
    toIdentifier: "indraDEF",
    type: "create",
  };
};

export const createTestChannelState = (): FullChannelState => {
  return {
    assetIds: ["0x0000000000000000000000000000000000000000", "0x1000000000000000000000000000000000000000"],
    balances: [
      // assetId0
      {
        amount: ["1", "2"],
        to: ["0xa000000000000000000000000000000000000000", "0xb000000000000000000000000000000000000000"],
      },
      // assetId1
      {
        amount: ["1", "2"],
        to: ["0xa000000000000000000000000000000000000000", "0xb000000000000000000000000000000000000000"],
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
    channelAddress: "0x1110000000000000000000000000000000000000",
    latestDepositNonce: 1,
    latestUpdate: createTestChannelUpdate(),
    merkleRoot: "0x",
    networkContext: {
      chainId: 1337,
      channelFactoryAddress: "0x0000000000000000000000000000000000000000",
      providerUrl: "",
      adjudicatorAddress: "0x0000000000000000000000000000000000000000",
      vectorChannelMastercopyAddress: "0x0000000000000000000000000000000000000000",
    },
    nonce: 2,
    participants: ["0xa000000000000000000000000000000000000000", "0xb000000000000000000000000000000000000000"],
    publicIdentifiers: ["indraABC", "indraDEF"],
    timeout: "1",
  };
};
