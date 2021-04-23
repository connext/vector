import * as merkle from "vector-merkle-tree";
import { CoreTransferState } from "@connext/vector-types";
import { HashZero } from "@ethersproject/constants";
import { keccak256 } from "ethereumjs-util";
import { MerkleTree } from "merkletreejs";

import { hashCoreTransferState } from "./transfers";

export const generateMerkleTreeData = (transfers: CoreTransferState[]): { root: string; tree: MerkleTree } => {
  // Sort transfers alphabetically by id
  const sorted = transfers.sort((a, b) => a.transferId.localeCompare(b.transferId));

  // Create leaves
  const leaves = sorted.map((transfer) => {
    return hashCoreTransferState(transfer);
  });

  // Generate tree
  const tree = new merkle.Tree();
  tree.insert_hex_js(leaves);
  // const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

  // Return
  const calculated = tree.getHexRoot();
  return {
    root: calculated === "0x" ? HashZero : calculated,
    tree,
  };
};
