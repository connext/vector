import { VectorChainReader, StableSwap } from "@connext/vector-contracts";
import { expect, mkAddress } from "@connext/vector-utils";
import { Result } from "@connext/vector-types";
import Sinon from "sinon";
import { getConfig } from "../../config";
import { ConfigServiceError } from "../../errors";
import { getRebalanceProfile, getMappedAssets, onSwapGivenIn } from "../../services/config";
import { parseEther } from "ethers/lib/utils";

const config = getConfig();

describe.only("config.ts", () => {
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
    it("happy: getMappedAssets", () => {
      const res = getMappedAssets(fromAssetId, fromChainId);
      console.log(res);
    });
  });

  describe.skip("onSwapGivenIn", () => {
    it("error if getOnchainBalance errors", () => {
      ethReader.getOnchainBalance.onFirstCall().rejects(
        Result.fail(
          new ConfigServiceError(ConfigServiceError.reasons.CouldNotGetAssetBalance, {
            transferAmount,
            fromAssetId,
            fromChainId,
            routerSignerAddress,
          }),
        ),
      );
      // const res = await onSwapGivenIn(
      //   transferAmount.toString(),
      //   fromAssetId,
      //   fromChainId,
      //   toAssetId,
      //   toChainId,
      //   routerSignerAddress,
      //   ethReader,
      // );
      // expect(res.isError()).to.be.true;
    });

    it("case", async () => {
      // const res = await onSwapGivenIn(
      //   transferAmount.toString(),
      //   fromAssetId,
      //   fromChainId,
      //   toAssetId,
      //   toChainId,
      //   routerSignerAddress,
      //   ethReader,
      // );
    });
  });

  describe("shouldChargeFees", () => {});
});
