import { calculateExchangeAmount, expect, getRandomAddress, inverse } from "@connext/vector-utils";

import { getSwappedAmount } from "../../services/swap";
import { config } from "../../config";
import { SwapError } from "../../errors";

describe("swap.ts", () => {
  describe("getSwappedAmount", () => {
    it("should fail if it cannot find a swap or an inverted swap", () => {
      const fromAmount = "25";
      const fromAssetId = config.allowedSwaps[0].fromAssetId;
      const fromChainId = config.allowedSwaps[0].fromChainId;
      const toAssetId = getRandomAddress();
      const toChainId = config.allowedSwaps[0].toChainId;

      const res = getSwappedAmount(fromAmount, fromAssetId, fromChainId, toAssetId, toChainId);
      expect(res.getError().message).to.be.eq(SwapError.reasons.SwapNotAllowed);
      expect(res.getError().context).to.be.deep.eq({
        fromAmount,
        channelAddress: "",
        fromAssetId,
        fromChainId,
        toAssetId,
        toChainId,
      });
    });

    // currently fails in the config ajv validation for priceType
    it.skip("should fail if the swap is not hardcoded");

    it("should work if not inverted + hardcoded rate", () => {
      const fromAmount = "25";
      const fromAssetId = config.allowedSwaps[0].fromAssetId;
      const fromChainId = config.allowedSwaps[0].fromChainId;
      const toAssetId = config.allowedSwaps[0].toAssetId;
      const toChainId = config.allowedSwaps[0].toChainId;

      const res = getSwappedAmount(fromAmount, fromAssetId, fromChainId, toAssetId, toChainId);
      expect(res.getError()).to.be.undefined;
      expect(res.getValue()).to.be.deep.eq(calculateExchangeAmount(fromAmount, config.allowedSwaps[0].hardcodedRate));
    });

    it("should work if inverted + hardcoded rate", () => {
      const fromAmount = "25";
      const fromAssetId = config.allowedSwaps[0].toAssetId;
      const fromChainId = config.allowedSwaps[0].toChainId;
      const toAssetId = config.allowedSwaps[0].fromAssetId;
      const toChainId = config.allowedSwaps[0].fromChainId;

      const res = getSwappedAmount(fromAmount, fromAssetId, fromChainId, toAssetId, toChainId);
      expect(res.getError()).to.be.undefined;
      expect(res.getValue()).to.be.deep.eq(
        calculateExchangeAmount(fromAmount, inverse(config.allowedSwaps[0].hardcodedRate)),
      );
    });
  });
});
