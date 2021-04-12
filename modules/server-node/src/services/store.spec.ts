import {
  createTestChannelState,
  getRandomChannelSigner,
  mkAddress,
  mkHash,
  mkSig,
  testStore,
} from "@connext/vector-utils";

import { PrismaStore } from "./store";
import { config } from "../config";
import { expect } from "chai";
import { CreateUpdateDetails, ResolveUpdateDetails } from "@connext/vector-types";

const name = "PrismaStore";

testStore(name, () => new PrismaStore(config.dbUrl));

describe("Server node-specific methods", async () => {
  let store: PrismaStore;

  before(async () => {
    store = new PrismaStore(config.dbUrl);
  });

  beforeEach(async () => {
    await store.clear();
  });

  after(async () => {
    await store.disconnect();
  });

  describe("getUnsubmittedWithdrawals", () => {
    it("should get resolved withdrawals by transfer definition which dont have tx hashes and are not canceled", async () => {
      const channel1 = mkAddress("0xaaa");
      const aliceCS = getRandomChannelSigner();
      const bobCS = getRandomChannelSigner();
      const createState1 = createTestChannelState(
        "create",
        {
          channelAddress: channel1,
          aliceIdentifier: aliceCS.publicIdentifier,
          bobIdentifier: bobCS.publicIdentifier,
        },
        { transferId: mkHash("0x123"), meta: { routingId: mkHash("0x123") } },
      );
      await store.saveChannelState(createState1.channel, createState1.transfer);
      const resolveState1 = createTestChannelState(
        "resolve",
        {
          channelAddress: channel1,
          aliceIdentifier: aliceCS.publicIdentifier,
          bobIdentifier: bobCS.publicIdentifier,
          nonce: createState1.channel.nonce + 1,
        },
        { transferId: mkHash("0x123") },
      );
      await store.saveChannelState(resolveState1.channel, resolveState1.transfer);

      const createState2 = createTestChannelState(
        "create",
        {
          channelAddress: channel1,
          aliceIdentifier: aliceCS.publicIdentifier,
          bobIdentifier: bobCS.publicIdentifier,
          nonce: createState1.channel.nonce + 2,
        },
        { transferId: mkHash("0xaaa"), meta: { routingId: mkHash("0x456") } },
      );
      await store.saveChannelState(createState2.channel, createState2.transfer);
      const resolveState2 = createTestChannelState(
        "resolve",
        {
          channelAddress: channel1,
          aliceIdentifier: aliceCS.publicIdentifier,
          bobIdentifier: bobCS.publicIdentifier,
          nonce: createState1.channel.nonce + 3,
        },
        { transferId: mkHash("0xaaa") },
      );
      await store.saveChannelState(resolveState2.channel, resolveState2.transfer);

      // different transfer def
      const createState3 = createTestChannelState(
        "create",
        {
          channelAddress: channel1,
          aliceIdentifier: aliceCS.publicIdentifier,
          bobIdentifier: bobCS.publicIdentifier,
          nonce: createState1.channel.nonce + 4,
        },
        { transferId: mkHash("0xbbb"), meta: { routingId: mkHash("0x567") } },
      );
      (createState3.channel.latestUpdate.details as CreateUpdateDetails).transferDefinition = mkAddress("0xeee");
      await store.saveChannelState(createState3.channel, createState3.transfer);
      const resolveState3 = createTestChannelState(
        "resolve",
        {
          channelAddress: channel1,
          aliceIdentifier: aliceCS.publicIdentifier,
          bobIdentifier: bobCS.publicIdentifier,
          nonce: createState1.channel.nonce + 5,
        },
        { transferId: mkHash("0xbbb") },
      );
      await store.saveChannelState(resolveState3.channel, resolveState3.transfer);

      // cancelled withdrawal
      const createState4 = createTestChannelState(
        "create",
        {
          channelAddress: channel1,
          aliceIdentifier: aliceCS.publicIdentifier,
          bobIdentifier: bobCS.publicIdentifier,
          nonce: createState1.channel.nonce + 6,
        },
        { transferId: mkHash("0xccc"), meta: { routingId: mkHash("0x678") } },
      );
      await store.saveChannelState(createState4.channel, createState4.transfer);
      const resolveState4 = createTestChannelState(
        "resolve",
        {
          channelAddress: channel1,
          aliceIdentifier: aliceCS.publicIdentifier,
          bobIdentifier: bobCS.publicIdentifier,
          nonce: createState1.channel.nonce + 7,
        },
        { transferId: mkHash("0xccc") },
      );
      (resolveState4.channel.latestUpdate.details as ResolveUpdateDetails).transferResolver = {
        responderSignature: mkSig("0x0"),
      };
      await store.saveChannelState(resolveState4.channel, resolveState4.transfer);

      // submitted already
      const createState5 = createTestChannelState(
        "create",
        {
          channelAddress: channel1,
          aliceIdentifier: aliceCS.publicIdentifier,
          bobIdentifier: bobCS.publicIdentifier,
          nonce: createState1.channel.nonce + 6,
        },
        { transferId: mkHash("0xddd"), meta: { routingId: mkHash("0x789") } },
      );
      await store.saveChannelState(createState5.channel, createState5.transfer);
      const resolveState5 = createTestChannelState(
        "resolve",
        {
          channelAddress: channel1,
          aliceIdentifier: aliceCS.publicIdentifier,
          bobIdentifier: bobCS.publicIdentifier,
          nonce: createState1.channel.nonce + 7,
        },
        { transferId: mkHash("0xddd") },
      );
      await store.saveChannelState(resolveState5.channel, resolveState5.transfer);
      await store.saveWithdrawalCommitment(mkHash("0xddd"), {
        transactionHash: mkHash("0xeee"),
      } as any);

      const unsubmitted = await store.getUnsubmittedWithdrawals(
        channel1,
        createState1.channel.latestUpdate.details.transferDefinition,
      );
      expect(unsubmitted.length).to.eq(2);
    });
  });
});
