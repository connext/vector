import { FullTransferState } from "@connext/vector-types";
import { HashZero } from "@ethersproject/constants";
import { keccak256 } from "@ethersproject/keccak256";
import { MerkleTree } from "merkletreejs";

import { bufferify } from "./crypto";
import { hashCoreTransferState } from "./transfers";

export const generateMerkleTreeData = (
  transfers: FullTransferState[],
  toProve?: FullTransferState,
): { proof?: string[]; root: string } => {
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
  };
};
