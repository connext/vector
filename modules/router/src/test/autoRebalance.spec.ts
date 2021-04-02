import { VectorChainReader } from "@connext/vector-contracts";
import { expect, getRandomBytes32, getTestLoggers, mkAddress, mkBytes32 } from "@connext/vector-utils";
import Sinon from "sinon";
import { AllowedSwap, Result } from "@connext/vector-types";
import { Wallet } from "@ethersproject/wallet";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber } from "@ethersproject/bignumber";
import { parseEther } from "@ethersproject/units";
import axios from "axios";

import { rebalanceIfNeeded } from "../services/autoRebalance";
import { getConfig } from "../config";
import * as metrics from "../metrics";
import { PrismaStore } from "../services/store";

const config = getConfig();

const testName = "Auto Rebalance";
const { log } = getTestLoggers(testName, config.logLevel as any);
describe(testName, () => {
  describe("rebalanceIfNeeded", () => {
    let wallet: Sinon.SinonStubbedInstance<Wallet>;
    let chainService: Sinon.SinonStubbedInstance<VectorChainReader>;
    let hydratedProviders: { [chainId: number]: Sinon.SinonStubbedInstance<JsonRpcProvider> };
    let mockAxios: Sinon.SinonStubbedInstance<any>;
    let store: Sinon.SinonStubbedInstance<PrismaStore>;

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
      const result = await rebalanceIfNeeded(swap, log, wallet, chainService as any, hydratedProviders, store);
      expect(result.getError()).to.not.be.ok;
      expect(result.getValue()).to.eq(undefined);
    });

    it("should not rebalance if to chain is higher balance", async () => {
      chainService.getOnchainBalance.onFirstCall().resolves(Result.ok(BigNumber.from(parseEther("100"))));
      chainService.getOnchainBalance.onSecondCall().resolves(Result.ok(BigNumber.from(parseEther("150"))));
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
      const result = await rebalanceIfNeeded(swap, log, wallet, chainService as any, hydratedProviders, store);
      expect(result.getError()).to.not.be.ok;
      expect(result.getValue()).to.eq(undefined);
    });

    it("should rebalance", async () => {
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

      const hash = mkBytes32("0xa");
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
      log.info(wallet.sendTransaction.getCall(2));
    });
  });
});
