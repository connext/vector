import * as merkle from "vector-merkle-tree";
import { CoreTransferState } from "@connext/vector-types";
import { HashZero } from "@ethersproject/constants";

import { hashCoreTransferStateBuffer } from "./transfers";

export const generateMerkleTreeData = (
  transfers: CoreTransferState[],
): { root: string; tree: merkle.Tree; leaves: Buffer[] } => {
  // Sort transfers alphabetically by id
  const sorted = transfers.sort((a, b) => a.transferId.localeCompare(b.transferId));

  // Create leaves
  const tree = new merkle.Tree();
  const leaves = sorted.map((transfer) => {
    const leaf = hashCoreTransferStateBuffer(transfer);
    const leafStr = `0x${leaf.toString("hex")}`;
    tree.insert_hex_js(leafStr);
    return leaf;
  });

  // Generate tree
  // const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

  // Return
  const calculated = tree.root_js();

  return {
    root: calculated === "0x" ? HashZero : calculated,
    tree,
    leaves,
  };
};
