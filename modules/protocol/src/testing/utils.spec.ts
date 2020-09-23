import { BigNumber, constants, BigNumberish } from "ethers";
import { Balance, Result, IVectorOnchainService } from "@connext/vector-types";
import { mkAddress } from "@connext/vector-utils";
import { expect } from "chai";
import Sinon from "sinon";
import { VectorOnchainService } from "@connext/vector-contracts";

import { reconcileDeposit } from "../utils";

import { env } from "./utils";

type MockOnchainStubType = {
  [K in keyof IVectorOnchainService]: IVectorOnchainService[K];
};

type ReconcileDepositTest = {
  initialBalance: Omit<Balance, "to">;
  latestDepositNonce: number;
  lockedBalance: string;
  assetId: string;
  aliceDeposit: BigNumberish; // depositA deposit
  bobDeposit: BigNumberish; // user deposit
  stubs: Partial<MockOnchainStubType>;
  expected: Omit<Balance, "to"> & { latestDepositNonce: number };
  error: Error;
};

describe("utils", () => {
  describe.skip("addEvtHandler", () => {
    it("should attach with callback", async () => {});
    it("should attach with callback + filter", async () => {});
    it("should attach with callback + timeout", async () => {});
    it("should attach with callback + filter + timeout", async () => {});
  });

  // FIXME: THESE ARE BLOCKING TESTS!
  describe.skip("generateSignedChannelCommitment", () => {
    it("should not sign anything if there are two signatures", () => {});
    it("should work for participants[0] if there is not a counterparty signature included", () => {});
    it("should work for participants[1] if there is not a counterparty signature included", () => {});
    it("should work for participants[0] if there is a counterparty signature included", () => {});
    it("should work for participants[1] if there is a counterparty signature included", () => {});
  });

  // FIXME: THESE ARE BLOCKING TESTS!
  describe.skip("validateChannelUpdateSignatures", () => {
    it("should work for a valid single signed update", () => {});
    it("should work for a valid double signed update", () => {});
    it("should fail if there are not at the number of required sigs included", () => {});
    it("should fail if number of valid sigs !== number of required sigs", () => {});
    it("should fail if any of the signatures are invalid", () => {});
    it("should fail if the signatures are not sorted correctly", () => {});
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
      const { initialBalance, latestDepositNonce, stubs, aliceDeposit, bobDeposit } = testParams;
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

        // Default is nonce 1, deposit 0
        getLatestDepositByAssetId: Result.ok<{ nonce: BigNumber; amount: BigNumber }>({
          nonce: BigNumber.from((latestDepositNonce ?? 0) + 1),
          amount: BigNumber.from(aliceDeposit ?? 0),
        }),

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
        latestDepositNonce: 0,
        expected: { amount: ["18", "9"], latestDepositNonce: 1 },
      },
      {
        name: "should work for Alice Token deposit when onchain deposit was successful",
        aliceDeposit: 15,
        initialBalance: { amount: ["3", "9"] },
        latestDepositNonce: 0,
        assetId: mkAddress("0xdddd"),
        expected: { amount: ["18", "9"], latestDepositNonce: 1 },
      },
      {
        name: "should work for Bob Eth deposit when onchain deposit was successful",
        bobDeposit: 7,
        initialBalance: { amount: ["3", "9"] },
        expected: { amount: ["3", "16"], latestDepositNonce: 1 },
      },
      {
        name: "should work for Bob Token deposit when onchain deposit was successful",
        bobDeposit: 7,
        initialBalance: { amount: ["3", "9"] },
        assetId: mkAddress("0xdddd"),
        expected: { amount: ["3", "16"], latestDepositNonce: 1 },
      },
      {
        name: "should work for both Eth deposit when onchain deposits were successful",
        bobDeposit: 7,
        aliceDeposit: 15,
        initialBalance: { amount: ["3", "9"] },
        latestDepositNonce: 0,
        expected: { amount: ["18", "16"], latestDepositNonce: 1 },
      },
      {
        name: "should work for both token deposit when onchain deposits were successful",
        bobDeposit: 7,
        aliceDeposit: 15,
        initialBalance: { amount: ["3", "9"] },
        latestDepositNonce: 0,
        assetId: mkAddress("0xdddd"),
        expected: { amount: ["18", "16"], latestDepositNonce: 1 },
      },
    ];

    for (const test of tests) {
      const { name, initialBalance, latestDepositNonce, lockedBalance, assetId, error, expected } = test;
      it(name, async () => {
        // Create the onchain service
        const chainService = getOnchainService(test);

        // Run the test
        const result = await reconcileDeposit(
          channelAddress,
          chainId,
          { ...(initialBalance ?? { amount: ["0", "0"] }), to },
          latestDepositNonce ?? 0,
          lockedBalance ?? "0",
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
            latestDepositNonce: expected.latestDepositNonce,
          });
        }
      });
    }
  });
});
