import { createCoreTransferState, expect } from "./test";
import { getRandomBytes32 } from "./hexStrings";
import { generateMerkleTreeData } from "./merkle";
import { HashZero } from "@ethersproject/constants";

describe("generateMerkleTreeData", () => {
  const generateTransfers = (noTransfers = 1) => {
    return Array(noTransfers)
      .fill(0)
      .map((_, i) => {
        return createCoreTransferState({ transferId: getRandomBytes32() });
      });
  };

  it("should generate a nonzero root for a single transfer", () => {
    const { root } = generateMerkleTreeData(generateTransfers());
    expect(root).to.not.be.eq(HashZero);
  });

  it("should work for multiple transfers", () => {
    const transfers = generateTransfers(1_000);
    const { root } = generateMerkleTreeData(transfers);
    expect(root).to.not.be.eq(HashZero);
  });
});
