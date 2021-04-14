import { CoreTransferState } from "@connext/vector-types";
import { HashZero } from "@ethersproject/constants";
import { keccak256 } from "ethereumjs-util";
import { MerkleTree } from "merkletreejs";

import { bufferify } from "./crypto";
import { hashCoreTransferState } from "./transfers";

export const generateMerkleTreeData = (
  transfers: CoreTransferState[],
  toProve?: CoreTransferState,
): { proof?: string[]; root: string; tree: MerkleTree } => {
  // Sort transfers alphabetically by id
  const sorted = transfers.sort((a, b) => a.transferId.localeCompare(b.transferId));

  // Create leaves
  const leaves = sorted.map((transfer) => {
    return bufferify(hashCoreTransferState(transfer));
  });

  // Generate tree
  const tree = new MerkleTree(leaves, keccak256);

  // Get proof if needed
  const proof = toProve ? tree.getHexProof(bufferify(hashCoreTransferState(toProve))) : undefined;

  // Return
  const calculated = tree.getHexRoot();
  return {
    root: calculated === "0x" ? HashZero : calculated,
    proof,
    tree,
  };
};
