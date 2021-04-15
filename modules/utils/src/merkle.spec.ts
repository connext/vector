import { createCoreTransferState, expect } from "./test";
import { getRandomBytes32, isValidBytes32 } from "./hexStrings";
import { generateMerkleTreeData } from "./merkle";
import { HashZero } from "@ethersproject/constants";
import { hashCoreTransferState } from "./transfers";

import { MerkleTree } from "merkletreejs";
import { keccak256 } from "ethereumjs-util";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";
import { bufferify } from "./crypto";

describe("generateMerkleTreeData", () => {
  const generateTransfers = (noTransfers = 1) => {
    return Array(noTransfers)
      .fill(0)
      .map((_, i) => {
        return createCoreTransferState({ transferId: getRandomBytes32() });
      });
  };

  it("should work for a single transfer", () => {
    const [transfer] = generateTransfers();
    const { root, tree, proof } = generateMerkleTreeData([transfer], transfer);
    expect(root).to.not.be.eq(HashZero);
    expect(isValidBytes32(root)).to.be.true;
    console.log();

    const leaf = bufferify(hashCoreTransferState(transfer).substring(1));
    expect(tree.verify(proof!, leaf, root)).to.be.true;
  });

  it("should work for multiple transfers", () => {
    const transfers = generateTransfers(1_000);

    const randomIdx = Math.floor(Math.random() * 1_000);
    const toProve = transfers[randomIdx];

    const { root, tree, proof } = generateMerkleTreeData(transfers, toProve);
    expect(root).to.not.be.eq(HashZero);
    expect(isValidBytes32(root)).to.be.true;

    const leaf = bufferify(hashCoreTransferState(toProve).substring(1));
    expect(tree.verify(proof!, leaf, root)).to.be.true;
  });

  it.only("library should work in general", () => {
    const numLeaves = 10;
    const leaves = Array(numLeaves)
      .fill(0)
      .map((i) => getRandomBytes32());

    const randomIdx = Math.floor(Math.random() * numLeaves);

    // test with ethereumjs
    const hashedKeccak = leaves.map((l) => keccak256(bufferify(l)));

    // test with solidity
    const hashedSolidity = leaves.map((l) => solidityKeccak256(["bytes32"], [l]));

    expect(hashedKeccak.map((l) => "0x" + l.toString("hex"))).to.be.deep.eq(hashedSolidity);

    // Generate tree with ethereumjs
    const treeKeccak = new MerkleTree(hashedKeccak, keccak256);
    expect(
      treeKeccak.verify(
        treeKeccak.getHexProof(hashedKeccak[randomIdx], randomIdx),
        hashedKeccak[randomIdx],
        treeKeccak.getHexRoot(),
      ),
    ).to.be.true;

    // Generate tree with solidity
    const solLeaves = hashedSolidity.map((l) => bufferify(l.substring(1)));
    const treeSolidity = new MerkleTree(solLeaves, keccak256);
    expect(
      treeSolidity.verify(
        treeSolidity.getHexProof(solLeaves[randomIdx], randomIdx),
        solLeaves[randomIdx],
        treeSolidity.getHexRoot(),
      ),
    ).to.be.true;
  });
});
