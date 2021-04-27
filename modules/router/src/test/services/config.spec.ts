import { parseEther } from "@ethersproject/units";
import { VectorChainReader } from "@connext/vector-contracts";
import { expect, mkAddress, getTestLoggers } from "@connext/vector-utils";
import { Result, IVectorChainReader, ChainError } from "@connext/vector-types";
import Sinon from "sinon";
import { getConfig } from "../../config";
import { ConfigServiceError } from "../../errors";
import { getRebalanceProfile, getMappedAssets, getPriceImpact, onSwapGivenIn } from "../../services/config";

const config = getConfig();

const testName = "config";
const { log } = getTestLoggers(testName, config.logLevel ?? ("info" as any));

describe("config.ts", () => {
  const chainId = parseInt(Object.keys(config.chainProviders)[0]);
  const transferAmount = parseEther("1");
  const fromAssetId: string = mkAddress("0xA");
  const fromChainId: number = 1337;
  const toAssetId: string = mkAddress("0xB");
  const toChainId: number = 1338;
  const routerSignerAddress: string = mkAddress("0xC");
  let ethReader: Sinon.SinonStubbedInstance<VectorChainReader>;

  beforeEach(async () => {
    ethReader = Sinon.createStubInstance(VectorChainReader);
  });

  afterEach(() => {
    Sinon.restore();
  });

  describe("getRebalanceProfile", () => {
    it("should fail if rebalance profile does not exist", () => {
      const assetId = mkAddress("0xeee");
      const res = getRebalanceProfile(chainId, assetId);
      expect(res.getError()!.message).to.be.eq(ConfigServiceError.reasons.UnableToGetRebalanceProfile);
      expect(res.getError()!.context).to.be.deep.eq({ chainId, assetId });
    });

    it("should return the rebalance profile for given chain/asset", () => {
      const assetId = config.rebalanceProfiles[0].assetId;
      const res = getRebalanceProfile(chainId, assetId);
      expect(res.getError()).to.be.deep.eq(undefined);
      expect(res.getValue()).to.be.deep.eq(config.rebalanceProfiles[0]);
    });
  });

  describe("getMatchingSwap", () => {});

  describe("getSwapFees", () => {});

  describe("getMappedAssets", () => {
    it("should map assets correctly", () => {
      const res = getMappedAssets(fromAssetId, fromChainId);
      expect(res).to.deep.equal(
        [
          {
            assetId: '0xA000000000000000000000000000000000000000',
            chainId: 1337
          }
        ],
        "Did not return appropriate unique pair(s)."
      );
    });
  });

  describe("getPriceImpact", () => {
    it("should return 0 for 1:1", () => {
      const marketPrice = parseEther("1");
      const estimatedPrice = parseEther("1");
      const res = getPriceImpact(marketPrice, estimatedPrice);
      expect(res).to.equal(0, "Did not return appropriate value for price impact.");
    });

    it("should return 20% for 1:1.2", () => {
      const marketPrice = parseEther("1");
      const estimatedPrice = parseEther("1.2");
      const res = getPriceImpact(marketPrice, estimatedPrice);
      expect(res).to.equal(20, "Did not return appropriate value for price impact.");
    });
  });

  describe("onSwapGivenIn", () => {
    it("error if getOnchainBalance errors", async () => {
      ethReader.getOnchainBalance.onFirstCall().resolves(Result.fail(new ChainError("getOnchainBalance error")));
      const res = await onSwapGivenIn(
        transferAmount,
        fromAssetId,
        fromChainId,
        toAssetId,
        toChainId,
        routerSignerAddress,
        ethReader as IVectorChainReader,
        log,
      );

      expect(res.isError).to.be.true;
      expect(res.getError()!.message).to.be.eq(ConfigServiceError.reasons.CouldNotGetAssetBalance);
    });

    it("error if provider isn't provided", async () => {
      ethReader.getOnchainBalance.onFirstCall().resolves(Result.ok(parseEther("100")));
      ethReader.getOnchainBalance.onSecondCall().resolves(Result.ok(parseEther("100")));
      const res = await onSwapGivenIn(
        transferAmount,
        fromAssetId,
        fromChainId,
        toAssetId,
        toChainId,
        routerSignerAddress,
        ethReader as IVectorChainReader,
        log,
      );

      expect(res.isError).to.be.true;
      expect(res.getError()!.message).to.be.eq(ConfigServiceError.reasons.UnableToGetSwapRate);
    });
  });

  describe("shouldChargeFees", () => {});
});
