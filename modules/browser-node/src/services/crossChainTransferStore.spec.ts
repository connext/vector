import { getRandomBytes32, expect } from "@connext/vector-utils";

import { createTestStoredCrossChainTransfer } from "../testing/utils";

import {
  getCrossChainTransfer,
  getCrossChainTransfers,
  removeCrossChainTransfer,
  saveCrossChainTransfer,
} from "./crossChainTransferStore";

describe("crossChainTransferStore", () => {
  afterEach(() => {
    localStorage.clear();
  });

  describe("getCrossChainTransfers / getCrossChainTransfer / saveCrossChainTransfer", () => {
    it("should work", () => {
      const transfers = Array(5)
        .fill(0)
        .map((_) => createTestStoredCrossChainTransfer({ crossChainTransferId: getRandomBytes32() }));

      // Before setting test null values
      expect(getCrossChainTransfers()).to.be.deep.eq([]);
      expect(getCrossChainTransfer(transfers[0].crossChainTransferId)).to.be.undefined;

      // Set all transfers
      transfers.map((t) => {
        const { status, crossChainTransferId, ...params } = t;
        saveCrossChainTransfer(crossChainTransferId, status, params);
      });
      expect(getCrossChainTransfers()).to.be.deep.eq(transfers);
      expect(getCrossChainTransfer(transfers[0].crossChainTransferId)).to.be.deep.eq(transfers[0]);
    });
  });

  describe("removeCrossChainTransfer", () => {
    const crossChainTransfer = createTestStoredCrossChainTransfer();
    beforeEach(() => {
      const { status, crossChainTransferId, ...params } = crossChainTransfer;
      saveCrossChainTransfer(crossChainTransferId, status, params);
    });
    it("should work if transfer exists", () => {
      removeCrossChainTransfer(crossChainTransfer.crossChainTransferId);
      expect(getCrossChainTransfer(crossChainTransfer.crossChainTransferId)).to.be.undefined;
    });
    it("should not error if transfer doesnt exist", () => {
      expect(removeCrossChainTransfer(getRandomBytes32())).to.not.throw;
    });
  });
});
