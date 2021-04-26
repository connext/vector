import * as merkle from "@connext/vector-merkle-tree";
import { CoreTransferState } from "@connext/vector-types";
import { keccak256 } from "ethereumjs-util";
import { MerkleTree } from "merkletreejs";

import { encodeCoreTransferState, hashCoreTransferState } from "./transfers";

type MerkleTreeUpdate = {
  root: string;
  tree: merkle.Tree;
};

export const generateMerkleTreeData = (transfers: CoreTransferState[]): MerkleTreeUpdate => {
  // Create leaves
  const tree = new merkle.Tree();

  let root: string;
  try {
    transfers.forEach((transfer) => {
      tree.insert_hex_js(encodeCoreTransferState(transfer));
    });
    root = tree.root_js();
  } catch (e) {
    tree.free();
    throw e;
  }

  return {
    root,
    tree,
  };
};

export const addTransferToTree = (transfer: CoreTransferState, tree: merkle.Tree): MerkleTreeUpdate => {
  let root: string;
  try {
    tree.insert_hex_js(encodeCoreTransferState(transfer));
    root = tree.root_js();
  } catch (e) {
    tree.free();
    throw e;
  }
  return {
    root,
    tree,
  };
};

export const removeTransferFromTree = (transfer: CoreTransferState, tree: merkle.Tree): MerkleTreeUpdate => {
  let root: string;
  try {
    tree.insert_hex_js(encodeCoreTransferState(transfer));
    root = tree.root_js();
  } catch (e) {
    tree.free();
    throw e;
  }
  return {
    root,
    tree,
  };
};

// Get merkle proof of transfer
// TODO: use merkle.Tree not MerkleTree
export const getMerkleProof = (active: CoreTransferState[], toProve: string): string[] => {
  // Sort transfers alphabetically by id
  const sorted = active.sort((a, b) => a.transferId.localeCompare(b.transferId));

  const leaves = sorted.map((transfer) => hashCoreTransferState(transfer));
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });
  return tree.getHexProof(hashCoreTransferState(active.find((t) => t.transferId === toProve)!));
};
