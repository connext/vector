/* eslint-disable @typescript-eslint/no-empty-function */
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { AddressZero } from "@ethersproject/constants";
import { Balance, Result, IVectorChainReader, UpdateType } from "@connext/vector-types";
import {
  mkAddress,
  expect,
  getRandomChannelSigner,
  createTestChannelState,
  hashChannelCommitment,
  mkSig,
} from "@connext/vector-utils";
import Sinon from "sinon";
import { VectorChainReader } from "@connext/vector-contracts";

import { generateSignedChannelCommitment, mergeAssetIds, reconcileDeposit, getNextNonceForUpdate } from "../utils";

import { env } from "./env";

type MockOnchainStubType = {
  [K in keyof IVectorChainReader]: IVectorChainReader[K];
};

type ReconcileDepositTest = {
  initialBalance: Omit<Balance, "to">;
  processedDepositsA: string[];
  processedDepositsB: string[];
  assetId: string;
  aliceDeposit: BigNumberish; // depositA deposit
  bobDeposit: BigNumberish; // user deposit
  stubs: Partial<MockOnchainStubType>;
  expected: Omit<Balance, "to"> & { totalDepositsAlice: string; totalDepositsBob: string };
  error: Error;
};

describe("utils", () => {
  describe("mergeAssetIds", () => {
    it("should work", async () => {
      const alice = mkAddress("0xaaa");
      const bob = mkAddress("0xbbb");
      const { channel } = createTestChannelState(UpdateType.deposit, {
        alice,
        bob,
        assetIds: [
          "0x6818D725D967af69eFfFf23c5B1201a607242269",
          "0xb9A355a6BFd995642EC64D9186873A8adFC27DAf",
          "0x6818D725D967af69eFfFf23c5B1201a607242269".toLowerCase(),
          "0x" + "6818D725D967af69eFfFf23c5B1201a607242269".toUpperCase(),
        ],
        processedDepositsA: ["60", "13", "17", "35"],
        processedDepositsB: ["85", "7", "10", "7"],
        balances: [
          { to: [alice, bob], amount: ["15", "3"] },
          { to: [alice, bob], amount: ["17", "3"] },
          { to: [alice, bob], amount: ["2", "17"] },
          { to: [alice, bob], amount: ["9", "8"] },
        ],
        defundNonces: ["1", "1", "5", "3"],
      });

      const updated = mergeAssetIds(channel);
      expect(updated).to.containSubset({
        ...channel,
        assetIds: ["0x6818D725D967af69eFfFf23c5B1201a607242269", "0xb9A355a6BFd995642EC64D9186873A8adFC27DAf"],
        processedDepositsA: ["112", "13"],
        processedDepositsB: ["102", "7"],
        balances: [
          { to: [alice, bob], amount: ["26", "28"] },
          { to: [alice, bob], amount: ["17", "3"] },
        ],
        defundNonces: ["5", "1"],
      });
    });
  });

  describe("generateSignedChannelCommitment", () => {
    const signer = getRandomChannelSigner();
    const counterpartyAddress = mkAddress();
    const aliceState = createTestChannelState("create", { alice: signer.address, bob: counterpartyAddress }).channel;
    const bobState = createTestChannelState("create", { alice: counterpartyAddress, bob: signer.address }).channel;

    const tests: any = [
      {
        name: "should not sign anything if there are two signatures",
        state: aliceState,
        update: {
          aliceSignature: mkSig("0xaaa"),
          bobSignature: mkSig("0xbbb"),
        },
        expected: {
          aliceSignature: mkSig("0xaaa"),
          bobSignature: mkSig("0xbbb"),
        },
      },
      {
        name: "should work for participants[0] if there is not a counterparty signature included",
        state: aliceState,
        update: {
          aliceSignature: undefined,
          bobSignature: undefined,
        },
        expected: {
          aliceSignature: "sig",
          bobSignature: undefined,
        },
      },
      {
        name: "should work for participants[1] if there is not a counterparty signature included",
        state: bobState,
        update: {
          aliceSignature: undefined,
          bobSignature: undefined,
        },
        expected: {
          aliceSignature: undefined,
          bobSignature: "sig",
        },
      },
      {
        name: "should work for bob if there is an alice signature included",
        state: bobState,
        update: {
          aliceSignature: "test1",
          bobSignature: undefined,
        },
        expected: {
          aliceSignature: "test1",
          bobSignature: "sig",
        },
      },
      {
        name: "should work for alice if there is a bob signature included",
        state: aliceState,
        update: {
          aliceSignature: undefined,
          bobSignature: "test2",
        },
        expected: {
          aliceSignature: "sig",
          bobSignature: "test2",
        },
      },
    ];

    for (const test of tests) {
      const { name, update, expected, state } = test;

      it(name, async () => {
        const { networkContext, ...core } = state;
        // Run the test
        const result = (
          await generateSignedChannelCommitment(state, signer, update.aliceSignature, update.bobSignature)
        ).getValue();

        const aliceSignature =
          expected.aliceSignature === "sig"
            ? await signer.signMessage(hashChannelCommitment(core))
            : expected.aliceSignature;
        const bobSignature =
          expected.bobSignature === "sig"
            ? await signer.signMessage(hashChannelCommitment(core))
            : expected.bobSignature;

        const expectedSigs: string[] = [];
        for (let i = 0; i < 2; i++) {
          if (expected[i] == "sig") {
            expectedSigs[i] = await signer.signMessage(hashChannelCommitment(core));
          } else {
            expectedSigs[i] = expected[i];
          }
        }

        expect(result).to.deep.eq({
          core,
          aliceSignature,
          bobSignature,
        });
      });
    }
  });

  describe("reconcileDeposit", () => {
    const channelAddress = mkAddress("0xccc");
    const chainId = parseInt(Object.keys(env.chainProviders)[0]);
    const to = [mkAddress("0xaaa"), mkAddress("0xbbb")];

    const getChainReader = (testParams: Partial<ReconcileDepositTest>) => {
      const { initialBalance, stubs, aliceDeposit, bobDeposit, processedDepositsA, processedDepositsB } = testParams;
      const initialChainBalance = (initialBalance?.amount ?? []).reduce(
        (prev, curr) => prev.add(curr),
        BigNumber.from(0),
      );
      // Creat the mock with defaults
      const chainReader = Sinon.createStubInstance(VectorChainReader);
      // set return values
      const mockedValues = {
        // Default the value chainReader + depositA + multisig deposit
        getTotalDepositedA: Result.ok<BigNumber>(BigNumber.from(aliceDeposit ?? 0).add(processedDepositsA![0])),
        getTotalDepositedB: Result.ok<BigNumber>(BigNumber.from(bobDeposit ?? 0).add(processedDepositsB![0])),
        ...stubs,
      };
      Object.entries(mockedValues).forEach(([method, stub]) => {
        chainReader[method].resolves(stub);
      });
      // Return the chainReader service
      return chainReader;
    };

    afterEach(() => {
      // Restore all mocks from the chainReader service
      Sinon.restore();
    });

    const tests: (Partial<ReconcileDepositTest> & { name: string })[] = [
      {
        name: "should work for Alice Eth deposit when chainReader deposit was successful",
        aliceDeposit: 15,
        initialBalance: { amount: ["3", "9"] },
        processedDepositsA: ["10"],
        processedDepositsB: ["9"],
        expected: { amount: ["18", "9"], totalDepositsAlice: "25", totalDepositsBob: "9" },
      },
      {
        name: "should work for Alice Token deposit when onchain deposit was successful",
        aliceDeposit: 15,
        initialBalance: { amount: ["3", "9"] },
        processedDepositsA: ["10"],
        processedDepositsB: ["9"],
        assetId: mkAddress("0xdddd"),
        expected: { amount: ["18", "9"], totalDepositsAlice: "25", totalDepositsBob: "9" },
      },
      {
        name: "should work for Bob Eth deposit when onchain deposit was successful",
        bobDeposit: 7,
        initialBalance: { amount: ["3", "9"] },
        processedDepositsA: ["10"],
        processedDepositsB: ["9"],
        expected: { amount: ["3", "16"], totalDepositsAlice: "10", totalDepositsBob: "16" },
      },
      {
        name: "should work for Bob Token deposit when onchain deposit was successful",
        bobDeposit: 7,
        initialBalance: { amount: ["3", "9"] },
        assetId: mkAddress("0xdddd"),
        processedDepositsA: ["10"],
        processedDepositsB: ["9"],
        expected: { amount: ["3", "16"], totalDepositsAlice: "10", totalDepositsBob: "16" },
      },
      {
        name: "should work for both Eth deposit when onchain deposits were successful",
        bobDeposit: 7,
        aliceDeposit: 15,
        initialBalance: { amount: ["3", "9"] },
        processedDepositsA: ["10"],
        processedDepositsB: ["9"],
        expected: { amount: ["18", "16"], totalDepositsAlice: "25", totalDepositsBob: "16" },
      },
      {
        name: "should work for both token deposit when onchain deposits were successful",
        bobDeposit: 7,
        aliceDeposit: 15,
        initialBalance: { amount: ["3", "9"] },
        processedDepositsA: ["10"],
        processedDepositsB: ["9"],
        assetId: mkAddress("0xdddd"),
        expected: { amount: ["18", "16"], totalDepositsAlice: "25", totalDepositsBob: "16" },
      },
    ];

    for (const test of tests) {
      const { name, initialBalance, processedDepositsA, processedDepositsB, assetId, error, expected } = test;
      it(name, async () => {
        // Create the chainReader service
        const chainReader = getChainReader(test);

        // Run the test
        const result = await reconcileDeposit(
          channelAddress,
          chainId,
          { ...(initialBalance ?? { amount: ["0", "0"] }), to },
          processedDepositsA ? processedDepositsA[0] || "0" : "0",
          processedDepositsB ? processedDepositsB[0] || "0" : "0",
          assetId ?? AddressZero,
          chainReader as IVectorChainReader,
        );

        if (error) {
          expect(result.getError()).to.be.eq(error);
        } else if (expected) {
          expect(result.getError()).to.be.undefined;
          const returned = result.getValue()!;
          expect(returned).to.containSubset({
            balance: { amount: expected.amount, to },
            totalDepositsAlice: expected.totalDepositsAlice,
            totalDepositsBob: expected.totalDepositsBob,
          });
        }
      });
    }
  });

  describe('get next nonce for update', () => {
    const tests = [
      {
        name: "0 alice => 1",
        nonce: 0,
        isAlice: true,
        expect: 1,
      },
      {
        name: "0 bob => 2",
        nonce: 0,
        isAlice: false,
        expect: 2,
      },
      {
        name: "1 alice => 4",
        nonce: 1,
        isAlice: true,
        expect: 4,
      },
      {
        name: "1 bob => 2",
        nonce: 1,
        isAlice: false,
        expect: 2,
      },
      {
        name: "2 alice => 4",
        nonce: 2,
        isAlice: true,
        expect: 4,
      },
      {
        name: "2 bob => 3",
        nonce: 2,
        isAlice: false,
        expect: 3,
      },
      {
        name: "3 alice => 4",
        nonce: 3,
        isAlice: true,
        expect: 4,
      },
      {
        name: "3 bob => 6",
        nonce: 3,
        isAlice: false,
        expect: 6,
      },
      {
        name: "4 alice => 5",
        nonce: 4,
        isAlice: true,
        expect: 5,
      },
      {
        name: "4 bob => 6",
        nonce: 4,
        isAlice: false,
        expect: 6,
      },
      {
        name: "5 alice => 8",
        nonce: 5,
        isAlice: true,
        expect: 8,
      },
      {
        name: "5 bob => 6",
        nonce: 5,
        isAlice: false,
        expect: 6
      },
      {
        name: "6 alice => 8",
        nonce: 6,
        isAlice: true,
        expect: 8,
      },
      {
        name: "6 bob => 7",
        nonce: 6,
        isAlice: false,
        expect: 7,
      },
      {
        name: "7 alice => 8",
        nonce: 7,
        isAlice: true,
        expect: 8,
      },
      {
        name: "7 bob => 10",
        nonce: 7,
        isAlice: false,
        expect: 10,
      },
    ];

    for (const test of tests) {
      it(test.name, () => {
        const returned = getNextNonceForUpdate(test.nonce, test.isAlice);
        expect(returned).to.be.eq(test.expect);
      });
    }
  });
});
