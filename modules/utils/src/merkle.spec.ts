import { createCoreTransferState, expect } from "./test";
import { getRandomBytes32, isValidBytes32 } from "./hexStrings";
import { generateMerkleTreeData } from "./merkle";
import { HashZero } from "@ethersproject/constants";
import { hashCoreTransferState } from "./transfers";

import { MerkleTree } from "merkletreejs";
import { keccak256 } from "ethereumjs-util";
import { keccak256 as solidityKeccak256 } from "@ethersproject/solidity";
import { bufferify } from "./crypto";

describe.only("generateMerkleTreeData", () => {
  const generateTransfers = (noTransfers = 1) => {
    return Array(noTransfers)
      .fill(0)
      .map((_, i) => {
        return createCoreTransferState({ transferId: getRandomBytes32() });
      });
  };

  it("should work for a single transfer", () => {
    const [transfer] = generateTransfers();
    console.log("***** hash", hashCoreTransferState(transfer));
    const { root, tree, proof } = generateMerkleTreeData([transfer], transfer);
    expect(root).to.not.be.eq(HashZero);
    expect(isValidBytes32(root)).to.be.true;
    console.log();

    const leaf = bufferify(hashCoreTransferState(transfer).substring(2));
    expect(tree.verify(proof!, leaf, root)).to.be.true;
  });

  it.only("should work for multiple transfers", () => {
    const transfers = generateTransfers(1_000);

    const randomIdx = Math.floor(Math.random() * 1_000);
    const toProve = transfers[randomIdx];

    const { root, tree, proof } = generateMerkleTreeData(transfers, toProve);
    expect(root).to.not.be.eq(HashZero);
    expect(isValidBytes32(root)).to.be.true;

    const leaf = bufferify(hashCoreTransferState(toProve).substring(2));
    expect(tree.verify(proof!, leaf, root)).to.be.true;
  });

  it("library should work in general", () => {
    const numLeaves = 10;
    const leaves = Array(numLeaves)
      .fill(0)
      .map(() => getRandomBytes32());

    const randomIdx = Math.floor(Math.random() * numLeaves);
    // const randomIdx = 8;
    console.log("leaves", leaves);
    console.log("randomIdx", randomIdx);

    // test with ethereumjs
    const hashedKeccak = leaves.map((l) => keccak256(bufferify(l)));

    // test with solidity
    const hashedSolidity = leaves.map((l) => solidityKeccak256(["bytes32"], [l]));

    expect(hashedKeccak.map((l) => "0x" + l.toString("hex"))).to.be.deep.eq(hashedSolidity);
    const treeKeccak = new MerkleTree(hashedKeccak, keccak256, { sortPairs: true });

    // Generate tree with ethereumjs
    console.log("verifying ethereumjs -- positional");
    const pHexProof = treeKeccak.getPositionalHexProof(hashedKeccak[randomIdx], randomIdx);
    console.log("p-hex proof", pHexProof);
    const verifyEthJsPositional = treeKeccak.verify(pHexProof, hashedKeccak[randomIdx], treeKeccak.getHexRoot());
    console.log("verifyEthJsPositional: ", verifyEthJsPositional);
    expect(verifyEthJsPositional).to.be.true;

    console.log("verifying ethereumjs -- reg");
    const proof = treeKeccak.getProof(hashedKeccak[randomIdx], randomIdx);
    console.log("proof: ", proof);
    const verifyEthJsReg = treeKeccak.verify(proof, hashedKeccak[randomIdx], treeKeccak.getHexRoot());
    console.log("verifyEthJsReg: ", verifyEthJsReg);
    expect(verifyEthJsReg).to.be.true;

    const foo = proof.map((p) => "0x" + p.data.toString("hex"));
    console.log("foo: ", foo);
    const verifyEthJsRegMapped = treeKeccak.verify(foo, hashedKeccak[randomIdx], treeKeccak.getHexRoot());
    console.log("verifyEthJsRegMapped: ", verifyEthJsRegMapped);
    expect(verifyEthJsRegMapped).to.be.true;

    console.log("verifying ethereumjs -- hex");
    const hexProof = treeKeccak.getHexProof(hashedKeccak[randomIdx], randomIdx);
    console.log("hex proof", hexProof);
    const verifyEthJsHex = treeKeccak.verify(hexProof, hashedKeccak[randomIdx], treeKeccak.getHexRoot());
    console.log("verifyEthJsHex: ", verifyEthJsHex);
    expect(verifyEthJsHex).to.be.true;

    // Generate tree with solidity
    // console.log("verifying solidity");
    // const solLeaves = hashedSolidity.map((l) => bufferify(l.substring(2)));
    // const treeSolidity = new MerkleTree(solLeaves, keccak256);
    // const verifySolidity = treeSolidity.verify(
    //   treeSolidity.getHexProof(solLeaves[randomIdx], randomIdx),
    //   solLeaves[randomIdx],
    //   treeSolidity.getHexRoot(),
    // );
    // console.log("verifySolidity: ", verifySolidity);
    // expect(verifySolidity).to.be.true;
  });
});
