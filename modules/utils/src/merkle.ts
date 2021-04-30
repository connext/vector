import * as merkle from "@connext/vector-merkle-tree";
import { FullTransferState, CoreTransferState } from "@connext/vector-types";
import { keccak256 } from "ethereumjs-util";
import { MerkleTree } from "merkletreejs";

import { hashCoreTransferState } from "./transfers";

export const generateMerkleRoot = (transfers: FullTransferState[]): string => {
  // Create leaves
  const tree = new merkle.Tree();

  let root: string;
  try {
    transfers.forEach((transfer) => {
      tree.insertHex(transfer.encodedCoreState);
    });
    root = tree.root();
  } finally {
    tree.free();
  }

  return root;
};

// Get merkle proof of transfer
// TODO: use merkle.Tree not MerkleTree
export const getMerkleProof = (active: CoreTransferState[], toProve: string): string[] => {
  // Sort transfers alphabetically by id
  const sorted = active.slice(0).sort((a, b) => a.transferId.localeCompare(b.transferId));

  const leaves = sorted.map((transfer) => hashCoreTransferState(transfer));
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  return tree.getHexProof(hashCoreTransferState(active.find((t) => t.transferId === toProve)!));
};
