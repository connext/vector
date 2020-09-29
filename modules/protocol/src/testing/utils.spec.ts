/* eslint-disable @typescript-eslint/no-empty-function */
import { BigNumber, constants, BigNumberish } from "ethers";
import { Balance, Result, IVectorOnchainService, ChannelCommitmentData, FullChannelState } from "@connext/vector-types";
import {
  createTestChannelState,
  getRandomChannelSigner,
  hashChannelCommitment,
  mkAddress,
} from "@connext/vector-utils";
import { expect } from "chai";
import Sinon from "sinon";
import { VectorOnchainService } from "@connext/vector-contracts";

import { generateSignedChannelCommitment, reconcileDeposit, validateChannelUpdateSignatures } from "../utils";

import { env } from "./env";

type MockOnchainStubType = {
  [K in keyof IVectorOnchainService]: IVectorOnchainService[K];
};

type ReconcileDepositTest = {
  initialBalance: Omit<Balance, "to">;
  processedDepositsA: string[];
  processedDepositsB: string[];
  assetId: string;
  aliceDeposit: BigNumberish; // depositA deposit
  bobDeposit: BigNumberish; // user deposit
  stubs: Partial<MockOnchainStubType>;
  expected: Omit<Balance, "to"> & { totalDepositedA: string; totalDepositedB: string };
  error: Error;
};

describe("utils", () => {
  describe.skip("addEvtHandler", () => {
    it("should attach with callback", async () => {});
    it("should attach with callback + filter", async () => {});
    it("should attach with callback + timeout", async () => {});
    it("should attach with callback + filter + timeout", async () => {});
  });

  describe("generateSignedChannelCommitment", () => {
    const signer = getRandomChannelSigner();
    const counterpartyAddress = mkAddress();
    const aliceState = createTestChannelState("create", { participants: [signer.address, counterpartyAddress] });
    const bobState = createTestChannelState("create", { participants: [counterpartyAddress, signer.address] });

    const tests: any = [
      {
        name: "should not sign anything if there are two signatures",
        state: aliceState,
        updateSignatures: ["test1", "test2"],
        expected: ["test1", "test2"],
      },
      {
        name: "should work for participants[0] if there is not a counterparty signature included",
        state: aliceState,
        updateSignatures: [],
        expected: ["sig", undefined],
      },
      {
        name: "should work for participants[1] if there is not a counterparty signature included",
        state: bobState,
        updateSignatures: [],
        expected: [undefined, "sig"],
      },
      {
        name: "should work for participants[0] if there is a counterparty signature included",
        state: aliceState,
        updateSignatures: ["test2"],
        expected: ["sig", "test2"],
      },
      {
        name: "should work for participants[1] if there is a counterparty signature included",
        state: bobState,
        updateSignatures: ["test1"],
        expected: ["test1", "sig"],
      },
    ];

    for (const test of tests) {
      const { name, updateSignatures, expected, state } = test;

      it(name, async () => {
        const { networkContext, ...core } = state;
        const unsigned = {
          chainId: networkContext.chainId,
          state: core,
          channelFactoryAddress: networkContext.channelFactoryAddress,
          signatures: [],
        };
        // Run the test
        const result = await generateSignedChannelCommitment(state, signer, updateSignatures);

        // Doing this really dumb thing because, for some reason, signature functions are causing tests to be skipped
        let expectedSigs: string[] = [];
        for (let i = 0; i < 2; i++) {
          if (expected[i] == "sig") {
            expectedSigs[i] = await signer.signMessage(hashChannelCommitment(unsigned));
          } else {
            expectedSigs[i] = expected[i];
          }
        }

        expect(result).to.deep.eq({
          ...unsigned,
          signatures: expectedSigs,
        });
      });
    }
  });

  describe.only("validateChannelUpdateSignatures", () => {
    const aliceSigner = getRandomChannelSigner();
    const bobSigner = getRandomChannelSigner();
    const wrongSigner = getRandomChannelSigner();
    const state = createTestChannelState("create", { participants: [aliceSigner.address, bobSigner.address] });
    const { networkContext, ...core } = state;
    const unsigned = {
      chainId: networkContext.chainId,
      state: core,
      channelFactoryAddress: networkContext.channelFactoryAddress,
      signatures: [],
    };

    const tests = [
      {
        name: "should work for a valid single signed update",
        updateSignatures: [undefined, "bobSig"],
        requiredSigners: 1,
        expected: undefined,
      },
      {
        name: "should work for a valid double signed update",
        updateSignatures: ["aliceSig", "bobSig"],
        requiredSigners: 2,
        expected: undefined,
      },
      {
        name: "should fail if there are not at the number of required sigs included",
        updateSignatures: [undefined, "bobSig"],
        requiredSigners: 2,
        expected: "Only 1/2 signatures present",
      },
      {
        name: "should fail if any of the signatures are invalid",
        updateSignatures: [undefined, "wrongSig"],
        requiredSigners: 1,
        expected: "expected one of",
      },
      {
        name: "should fail if the signatures are not sorted correctly",
        updateSignatures: ["bobSig", "aliceSig"],
        requiredSigners: 2,
        expected: "expected",
      },
    ];

    for (const test of tests) {
      const { name, updateSignatures, requiredSigners, expected } = test;
      it(name, async () => {
        let signatures: (string | undefined)[] = [];

        // Have to do this because of weird race conditions around looping
        for (let i = 0; i < 2; i++) {
          if (updateSignatures[i] == "bobSig") {
            signatures[i] = await bobSigner.signMessage(hashChannelCommitment(unsigned));
          } else if (updateSignatures[i] == "aliceSig") {
            signatures[i] = await aliceSigner.signMessage(hashChannelCommitment(unsigned));
          } else if (updateSignatures[i] == "wrongSig") {
            signatures[i] = await wrongSigner.signMessage(hashChannelCommitment(unsigned));
          } else {
            signatures[i] = updateSignatures[i];
          }
        }

        const ret = await validateChannelUpdateSignatures(
          state,
          signatures as string[],
          requiredSigners as 1 | 2 | undefined,
        );

        if (expected) {
          expect(ret).includes(expected);
        } else {
          expect(ret).to.be.undefined;
        }
      });
    }
  });

  describe("reconcileDeposit", () => {
    // FIXME: THESE ARE BLOCKING TESTS!
    // TODO: do we have to test eth v. tokens? seems more relevant in the
    // chain service than in the reconcileDeposit
    it.skip("should fail if it cannot get the onchain balance", () => {});
    it.skip("should fail if it cannot get the latest deposit a", () => {});
    it.skip("should work if the offchain latest nonce is less than the onchain latest nonce", () => {});
    it.skip("should work if the offchain latest nonce is greater than the onchain latest nonce", () => {});
    it.skip("should work if the offchain latest nonce is equal to the onchain latest nonce", () => {});

    const channelAddress = mkAddress("0xccc");
    const chainId = parseInt(Object.keys(env.chainProviders)[0]);
    const to = [mkAddress("0xaaa"), mkAddress("0xbbb")];

    const getOnchainService = (testParams: Partial<ReconcileDepositTest>) => {
      const { initialBalance, stubs, aliceDeposit, bobDeposit, processedDepositsA, processedDepositsB } = testParams;
      const initialChainBalance = (initialBalance?.amount ?? []).reduce(
        (prev, curr) => prev.add(curr),
        BigNumber.from(0),
      );
      // Creat the mock with defaults
      const onchain = Sinon.createStubInstance(VectorOnchainService);
      // set return values
      const mockedValues = {
        // Default the value onchain + depositA + multisig deposit
        getChannelOnchainBalance: Result.ok<BigNumber>(initialChainBalance.add(aliceDeposit ?? 0).add(bobDeposit ?? 0)),
        getTotalDepositedA: Result.ok<BigNumber>(BigNumber.from(aliceDeposit ?? 0).add((processedDepositsA as any)!)),
        getTotalDepositedB: Result.ok<BigNumber>(BigNumber.from(bobDeposit ?? 0).add((processedDepositsB as any)!)),
        ...stubs,
      };
      Object.entries(mockedValues).forEach(([method, stub]) => {
        onchain[method].resolves(stub);
      });
      // Return the onchain service
      return onchain;
    };

    afterEach(() => {
      // Restore all mocks from the onchain service
      Sinon.restore();
    });

    const tests: (Partial<ReconcileDepositTest> & { name: string })[] = [
      {
        name: "should work for Alice Eth deposit when onchain deposit was successful",
        aliceDeposit: 15,
        initialBalance: { amount: ["3", "9"] },
        processedDepositsA: ["10"],
        processedDepositsB: ["9"],
        expected: { amount: ["18", "9"], totalDepositedA: "25", totalDepositedB: "9" },
      },
      {
        name: "should work for Alice Token deposit when onchain deposit was successful",
        aliceDeposit: 15,
        initialBalance: { amount: ["3", "9"] },
        processedDepositsA: ["10"],
        processedDepositsB: ["9"],
        assetId: mkAddress("0xdddd"),
        expected: { amount: ["18", "9"], totalDepositedA: "25", totalDepositedB: "9" },
      },
      {
        name: "should work for Bob Eth deposit when onchain deposit was successful",
        bobDeposit: 7,
        initialBalance: { amount: ["3", "9"] },
        processedDepositsA: ["10"],
        processedDepositsB: ["9"],
        expected: { amount: ["3", "16"], totalDepositedA: "10", totalDepositedB: "16" },
      },
      {
        name: "should work for Bob Token deposit when onchain deposit was successful",
        bobDeposit: 7,
        initialBalance: { amount: ["3", "9"] },
        assetId: mkAddress("0xdddd"),
        processedDepositsA: ["10"],
        processedDepositsB: ["9"],
        expected: { amount: ["3", "16"], totalDepositedA: "10", totalDepositedB: "16" },
      },
      {
        name: "should work for both Eth deposit when onchain deposits were successful",
        bobDeposit: 7,
        aliceDeposit: 15,
        initialBalance: { amount: ["3", "9"] },
        processedDepositsA: ["10"],
        processedDepositsB: ["9"],
        expected: { amount: ["18", "16"], totalDepositedA: "25", totalDepositedB: "16" },
      },
      {
        name: "should work for both token deposit when onchain deposits were successful",
        bobDeposit: 7,
        aliceDeposit: 15,
        initialBalance: { amount: ["3", "9"] },
        processedDepositsA: ["10"],
        processedDepositsB: ["9"],
        assetId: mkAddress("0xdddd"),
        expected: { amount: ["18", "16"], totalDepositedA: "25", totalDepositedB: "16" },
      },
    ];

    for (const test of tests) {
      const { name, initialBalance, processedDepositsA, processedDepositsB, assetId, error, expected } = test;
      it(name, async () => {
        // Create the onchain service
        const chainService = getOnchainService(test);

        // Run the test
        const result = await reconcileDeposit(
          channelAddress,
          chainId,
          { ...(initialBalance ?? { amount: ["0", "0"] }), to },
          processedDepositsA ? processedDepositsA[0] || "0" : "0",
          processedDepositsB ? processedDepositsB[0] || "0" : "0",
          assetId ?? constants.AddressZero,
          chainService,
        );

        if (error) {
          expect(result.getError()).to.be.eq(error);
        } else if (expected) {
          expect(result.getError()).to.be.undefined;
          const returned = result.getValue()!;
          expect(returned).to.containSubset({
            balance: { amount: expected.amount, to },
            totalDepositedA: expected.totalDepositedA,
            totalDepositedB: expected.totalDepositedB,
          });
        }
      });
    }
  });
});
