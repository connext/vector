import { VectorChainReader } from "@connext/vector-contracts";
import { expect, getRandomBytes32, getTestLoggers, mkAddress, mkBytes32 } from "@connext/vector-utils";
import Sinon from "sinon";
import { AllowedSwap, Result } from "@connext/vector-types";
import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber } from "@ethersproject/bignumber";
import { parseEther } from "@ethersproject/units";
import axios from "axios";
import PriorityQueue from "p-queue";

import { rebalanceIfNeeded } from "../services/autoRebalance";
import { getConfig } from "../config";
import * as metrics from "../metrics";
import { PrismaStore, RouterRebalanceStatus } from "../services/store";
import { _createQueueForSwap } from "../services/rebalanceQueue";
import { AutoRebalanceServiceError } from "../errors";

const config = getConfig();

const testName = "Auto Rebalance";
const { log } = getTestLoggers(testName, config.logLevel as any);

/// Centralized method for setting up rebalance stuff, making mock instances
const setupForRebalance = (
  mockAxios: Sinon.SinonStubbedInstance<any>,
  wallet: Sinon.SinonStubbedInstance<Wallet>,
  hydratedProviders: { [chainId: number]: Sinon.SinonStubbedInstance<JsonRpcProvider> },
  chainService: Sinon.SinonStubbedInstance<VectorChainReader>,
  ): {
    transaction: {
      to: string;
      data: string;
      chainId: number;
      value: number;
    };
    hash: string;
   } => {
  // For the format of these response schemas see:
  // vector/modules/types/src/schemas/autoRebalance.ts
  const transaction = {
    to: mkAddress("0xa"),
    data: getRandomBytes32(),
    chainId: 1338,
    value: 0,
  };
  // First call is /approve endpoint.
  mockAxios.onCall(0).resolves({
    data: {
      allowance: "10000",
      transaction: {
        ...transaction,
        value: 0,
      },
    },
  });
  // Second call is /execute endpoint.
  mockAxios.onCall(1).resolves({
    data: {
      transaction: {
        ...transaction,
        value: 0,
      },
    },
  });
  // Third call is /status endpoint.
  mockAxios.onCall(2).resolves({
    data: {
      status: { completed: true, transaction },
    },
  });

  // All 3 calls need to resolve: approve, execute, complete.
  // First two should be on 1337, complete will be on 1338.
  ([1337, 1338]).forEach((id) => {
    hydratedProviders[id].waitForTransaction.resolves({
      to: mkAddress("0xa"),
      from: mkAddress("0xa"),
      contractAddress: "",
      transactionIndex: 0,
      // root?: string,
      gasUsed: BigNumber.from(0),
      logsBloom: "",
      blockHash: "",
      transactionHash: "",
      logs: [],
      blockNumber: 0,
      confirmations: 10,
      cumulativeGasUsed: BigNumber.from(0),
      byzantium: false,
      status: 1
    });
  })

  const hash = mkBytes32("0xa");
  // Based on the numbers hard coded below, the auto rebalancer should get 37.5 (half the difference).
  chainService.getOnchainBalance.onFirstCall().resolves(Result.ok(BigNumber.from(parseEther("175"))));
  chainService.getOnchainBalance.onSecondCall().resolves(Result.ok(BigNumber.from(parseEther("100"))));
  wallet.connect.returns(wallet);
  wallet.sendTransaction.resolves({
    hash,
    wait: () =>
      Promise.resolve({
        transactionHash: hash,
      } as any),
  } as any);

  return { transaction, hash };
}

describe.only(testName, () => {
  describe("rebalanceIfNeeded", () => {
    let wallet: Sinon.SinonStubbedInstance<Wallet>;
    let chainService: Sinon.SinonStubbedInstance<VectorChainReader>;
    let hydratedProviders: { [chainId: number]: Sinon.SinonStubbedInstance<JsonRpcProvider> };
    let mockAxios: Sinon.SinonStubbedInstance<any>;
    let mockConfirmation: Sinon.SinonStubbedInstance<any>;
    let store: Sinon.SinonStubbedInstance<PrismaStore>;
    const swap: AllowedSwap = {
      fromAssetId: "0x9FBDa871d559710256a2502A2517b794B482Db40",
      fromChainId: 1337,
      hardcodedRate: "1",
      priceType: "hardcoded",
      toAssetId: "0x9FBDa871d559710256a2502A2517b794B482Db40",
      toChainId: 1338,
      rebalanceThresholdPct: 20,
      rebalancerUrl: "http://example.com",
    };

    beforeEach(async () => {
      wallet = Sinon.createStubInstance(Wallet);

      chainService = Sinon.createStubInstance(VectorChainReader);
      hydratedProviders = {
        1337: Sinon.createStubInstance(JsonRpcProvider),
        1338: Sinon.createStubInstance(JsonRpcProvider),
      };
      const parseBalanceStub = Sinon.stub(metrics, "getDecimals").resolves(18);
      hydratedProviders[1337].getGasPrice.resolves(BigNumber.from(138));
      hydratedProviders[1338].getGasPrice.resolves(BigNumber.from(138));

      mockAxios = Sinon.stub(axios, "post");

      store = Sinon.createStubInstance(PrismaStore);
    });

    afterEach(() => {
      Sinon.restore();
      Sinon.reset();
    });

    it("should not rebalance if threshold is within", async () => {
      chainService.getOnchainBalance.onFirstCall().resolves(Result.ok(BigNumber.from(parseEther("100"))));
      chainService.getOnchainBalance.onSecondCall().resolves(Result.ok(BigNumber.from(parseEther("100"))));
      const result = await rebalanceIfNeeded(swap, log, wallet, chainService as any, hydratedProviders, store);
      expect(result.getError()).to.not.be.ok;
      expect(result.getValue()).to.eq(undefined);
    });

    it("should not rebalance if to chain is higher balance", async () => {
      chainService.getOnchainBalance.onFirstCall().resolves(Result.ok(BigNumber.from(parseEther("100"))));
      chainService.getOnchainBalance.onSecondCall().resolves(Result.ok(BigNumber.from(parseEther("150"))));
      const result = await rebalanceIfNeeded(swap, log, wallet, chainService as any, hydratedProviders, store);
      expect(result.getError()).to.not.be.ok;
      expect(result.getValue()).to.eq(undefined);
    });

    it("should rebalance", async () => {
      const { transaction, hash } = setupForRebalance(mockAxios, wallet, hydratedProviders, chainService);
      const result = await rebalanceIfNeeded(swap, log, wallet, chainService as any, hydratedProviders, store);
      expect(result.getError()).to.not.be.ok;
      expect(result.getValue()).to.eq(undefined);
      const { chainId, ...tx } = transaction;
      expect(wallet.sendTransaction.getCall(0).args[0]).to.containSubset({
        ...tx,
        value: 0,
      });
      expect(wallet.sendTransaction.getCall(1).args[0]).to.containSubset({
        ...tx,
        value: 0,
      });
      // Three phases of rebalance swap: approval, execution, completion.
      // By the third phase we should have all three txHashes.
      expect(store.saveRebalance.getCall(-1).firstArg).to.deep.include({
        status: RouterRebalanceStatus.COMPLETE,
        approveHash: hash,
        executeHash: hash,
        completeHash: hash
      });
    });

    it("should queue multiple calls", async () => {
      setupForRebalance(mockAxios, wallet, hydratedProviders, chainService);
      // Number of times we will spam rebalanceIfNeeded calls.
      const numberOfCalls = 5;

      // This will force creation of a new, empty queue for this swap.
      const priorityQueue = _createQueueForSwap(swap);
      // Keep queue paused, as we want to wait and load up on spammed calls first.
      // This will avoid any race conditions in this test, and essentially assume worst-case:
      // (e.g. 5 calls immediately in a row).
      priorityQueue.pause();

      // First rebalance call will actually 'rebalance' according to the imbalance setup in setupForRebalance.
      // Second and all subsuquent calls should find that no rebalance is needed.
      for (let i = 0; i < numberOfCalls; i++) {
        rebalanceIfNeeded(swap, log, wallet, chainService as any, hydratedProviders, store)
      }
      expect(priorityQueue.size === numberOfCalls, `Priority queue size should have equaled number of calls ${numberOfCalls}`);

      // Now we start the priority queue. It should execute each rebalance call one at a time.
      priorityQueue.start();
      // Wait until the priority queue has gone idle.
      await priorityQueue.onIdle();

      expect(store.getLatestRebalance.callCount === numberOfCalls, `Store method getLatestRebalance should have been called ${numberOfCalls} times.`);
    });
  });
});
