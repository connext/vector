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
    const { root, tree } = generateMerkleTreeData([transfer]);
    expect(root).to.not.be.eq(HashZero);
    expect(isValidBytes32(root)).to.be.true;

    const leaf = hashCoreTransferState(transfer);
    expect(tree.verify(tree.getHexProof(leaf), leaf, root)).to.be.true;
  });

  it("should work for multiple transfers", () => {
    const transfers = generateTransfers(1);

    const randomIdx = Math.floor(Math.random() * 1);
    const toProve = transfers[randomIdx];

    const { root, tree } = generateMerkleTreeData(transfers);
    expect(root).to.not.be.eq(HashZero);
    expect(isValidBytes32(root)).to.be.true;

    const leaf = hashCoreTransferState(toProve);
    expect(tree.verify(tree.getHexProof(leaf), leaf, root)).to.be.true;
  });

  it("library should work in general", () => {
    const numLeaves = 2;
    const leaves = Array(numLeaves)
      .fill(0)
      .map(() => getRandomBytes32());

    const randomIdx = Math.floor(Math.random() * numLeaves);

    // test with ethereumjs
    const hashedKeccak = leaves.map((l) => keccak256(bufferify(l)));

    // test with solidity
    const hashedSolidity = leaves.map((l) => solidityKeccak256(["bytes32"], [l]));

    expect(hashedKeccak.map((l) => "0x" + l.toString("hex"))).to.be.deep.eq(hashedSolidity);
    const treeKeccak = new MerkleTree(hashedKeccak, keccak256, { sortPairs: true });

    // Generate tree with ethereumjs
    const pHexProof = treeKeccak.getPositionalHexProof(hashedKeccak[randomIdx], randomIdx);
    const verifyEthJsPositional = treeKeccak.verify(pHexProof, hashedKeccak[randomIdx], treeKeccak.getHexRoot());
    expect(verifyEthJsPositional).to.be.true;

    const proof = treeKeccak.getProof(hashedKeccak[randomIdx], randomIdx);
    const verifyEthJsReg = treeKeccak.verify(proof, hashedKeccak[randomIdx], treeKeccak.getHexRoot());
    expect(verifyEthJsReg).to.be.true;

    const foo = proof.map((p) => "0x" + p.data.toString("hex"));
    const verifyEthJsRegMapped = treeKeccak.verify(foo, hashedKeccak[randomIdx], treeKeccak.getHexRoot());
    expect(verifyEthJsRegMapped).to.be.true;

    const hexProof = treeKeccak.getHexProof(hashedKeccak[randomIdx], randomIdx);
    const verifyEthJsHex = treeKeccak.verify(hexProof, hashedKeccak[randomIdx], treeKeccak.getHexRoot());
    expect(verifyEthJsHex).to.be.true;
  });
});
