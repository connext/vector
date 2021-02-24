import { calculateExchangeAmount, expect, getRandomAddress } from "@connext/vector-utils";

import { getSwappedAmount } from "../../services/swap";
import { getConfig } from "../../config";
import { SwapError } from "../../errors";

const config = getConfig();

describe("swap.ts", () => {
  describe("getSwappedAmount", () => {
    it("should fail if it cannot find a swap", async () => {
      const fromAmount = "25";
      const fromAssetId = config.allowedSwaps[0].fromAssetId;
      const fromChainId = config.allowedSwaps[0].fromChainId;
      const toAssetId = getRandomAddress();
      const toChainId = config.allowedSwaps[0].toChainId;

      const res = await getSwappedAmount(fromAmount, fromAssetId, fromChainId, toAssetId, toChainId);
      expect(res.getError()!.message).to.be.eq(SwapError.reasons.SwapNotAllowed);
      expect(res.getError()!.context).to.be.deep.eq({
        fromAmount,
        fromAssetId,
        fromChainId,
        toAssetId,
        toChainId,
      });
    });

    // currently fails in the config ajv validation for priceType
    it.skip("should fail if the swap is not hardcoded");

    it("should work if not inverted + hardcoded rate", async () => {
      const fromAmount = "25";
      const fromAssetId = config.allowedSwaps[0].fromAssetId;
      const fromChainId = config.allowedSwaps[0].fromChainId;
      const toAssetId = config.allowedSwaps[0].toAssetId;
      const toChainId = config.allowedSwaps[0].toChainId;

      const res = await getSwappedAmount(fromAmount, fromAssetId, fromChainId, toAssetId, toChainId);
      expect(res.getError()).to.be.undefined;
      expect(res.getValue()).to.be.deep.eq(calculateExchangeAmount(fromAmount, config.allowedSwaps[0].hardcodedRate));
    });
  });
});
