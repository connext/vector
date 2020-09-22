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
  describe("reconcileDeposit", () => {
    const channelAddress = mkAddress("ccc");
    const chainId = parseInt(Object.keys(env.chainProviders)[0]);
    const to = [mkAddress("aaa"), mkAddress("bbb")];

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
        name: "should work for Alice Eth deposit when onchain deposit was succuessful",
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
        assetId: mkAddress("dddd"),
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
        assetId: mkAddress("dddd"),
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
        assetId: mkAddress("dddd"),
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
