import * as merkle from "vector-merkle-tree";
import { CoreTransferState } from "@connext/vector-types";
import { HashZero } from "@ethersproject/constants";
import { keccak256 } from "ethereumjs-util";
import { MerkleTree } from "merkletreejs";

import { encodeCoreTransferState, hashCoreTransferState } from "./transfers";

export const generateMerkleTreeData = (transfers: CoreTransferState[]): { root: string; tree: merkle.Tree } => {
  // Create leaves
  const tree = new merkle.Tree();
  tree.free(); // handle memory leaks
  transfers.forEach((transfer) => {
    tree.insert_hex_js(encodeCoreTransferState(transfer));
  });

  // Return
  const calculated = tree.root_js();

  return {
    root: calculated === "0x" ? HashZero : calculated,
    tree,
  };
};

// Get merkle proof of transfer
// TODO: use merkle.Tree not MerkleTree
export const getMerkleProof = (active: CoreTransferState[], toProve: string): string[] => {
  // Sort transfers alphabetically by id
  // TODO: same sorting in merkle.Tree?
  const sorted = active.sort((a, b) => a.transferId.localeCompare(b.transferId));

  const leaves = sorted.map((transfer) => hashCoreTransferState(transfer));
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  return tree.getHexProof(hashCoreTransferState(active.find((t) => t.transferId === toProve)!));
};
