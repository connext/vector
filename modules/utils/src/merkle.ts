import { CoreTransferState } from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import { concat, arrayify, hexlify } from "@ethersproject/bytes";
import { HashZero } from "@ethersproject/constants";
import { isHexString, keccak256 } from "ethereumjs-util";
import { MerkleTree } from "merkletreejs";

import { bufferify } from "./crypto";
import { hashCoreTransferState } from "./transfers";

export const generateMerkleTreeData = (
  transfers: CoreTransferState[],
  toProve?: CoreTransferState,
  log: boolean = false,
): { proof?: string[]; root: string; tree: MerkleTree } => {
  // Sort transfers alphabetically by id
  const sorted = transfers.sort((a, b) => a.transferId.localeCompare(b.transferId));

  // Create leaves
  const leaves = sorted.map((transfer) => {
    return bufferify(hashCoreTransferState(transfer).substring(2));
  });

  // Generate tree
  const tree = new MerkleTree(leaves, keccak256, { sortPairs: true });

  // Get proof if needed
  let proof = [];
  if (toProve) {
    const idx = sorted.findIndex((t) => t.transferId === toProve.transferId);
    proof = tree.getHexProof(leaves[idx], idx);
  }

  // Return
  const calculated = tree.getHexRoot();
  console.log("***** calculated root", calculated);
  return {
    root: calculated === "0x" ? HashZero : calculated,
    proof,
    tree,
  };
};

// const combinedHash = (first: string, second: string): string => {
//   if (!second) {
//     return first;
//   }
//   if (!first) {
//     return second;
//   }
//   return keccak256(concat([first, second].sort()));
// };

// export class MerkleTree {
//   public elements: string[];
//   public root: string;
//   public layers: string[][];

//   public constructor(_elements: string[]) {
//     if (!_elements.every((e: string): boolean => isHexString(e) && arrayify(e).length === 32)) {
//       throw new Error("Each element must be a 32 byte hex string");
//     }

//     // deduplicate elements
//     this.elements = _elements
//       .filter((element: string, i: number): boolean => _elements.findIndex((e: string): boolean => element === e) === i)
//       .sort();

//     // Can't have an odd number of leaves
//     if (this.elements.length % 2 !== 0) {
//       this.elements.push(HashZero);
//     }

//     // Build merkle tree layers
//     this.layers = [];
//     // Set root to HashZero if given zero elements
//     if (this.elements.length === 0) {
//       this.layers.push([HashZero]);
//     } else {
//       this.layers.push(this.elements);
//       while (this.topLayer.length > 1) {
//         this.layers.push(
//           this.topLayer.reduce(
//             (layer: string[], element: string, index: number, arr: string[]): string[] =>
//               index % 2 ? layer : layer.concat([combinedHash(element, arr[index + 1])]),
//             [],
//           ),
//         );
//       }
//     }

//     this.root = this.topLayer[0];
//   }

//   public get topLayer(): string[] {
//     return this.layers[this.layers.length - 1];
//   }

//   public proof(element: string): string {
//     let index = this.elements.findIndex((e: string): boolean => e === element);
//     if (index === -1) {
//       throw new Error("element not found in merkle tree");
//     }
//     const proofArray = this.layers.reduce(
//       (proof: string[], layer: string[]): string[] => {
//         const pairIndex: number = index % 2 ? index - 1 : index + 1;
//         if (pairIndex < layer.length) {
//           proof.push(layer[pairIndex]);
//         }
//         index = Math.floor(index / 2);
//         return proof;
//       },
//       [element],
//     );
//     return hexlify(concat(proofArray));
//   }

//   public verify(proof: string): boolean {
//     const proofArray: RegExpMatchArray = proof.substring(2).match(/.{64}/g) || [];
//     if (!proofArray || proofArray.length * 64 !== proof.length - 2) {
//       console.warn(`Invalid proof: expected a hex string describing n 32 byte chunks`);
//       return false;
//     }
//     const proofs: string[] = proofArray.map((p: string): string => `0x${p.replace("0x", "")}`);
//     return this.root === proofs.slice(1).reduce(combinedHash, proofs[0]);
//   }
// }

// leaves [
//   '0x4cb75a6b0738590846529050b514b1f511d818d432330bd9606ba3c4c343b1bf',
//   '0x59ea5ff441ff516b88976f4908c99ca2cf26e8a7920445df5cb4848654fcd803',
//   '0x7ebfdd9021e78381356f4cca707efaf058a6cbdf46d17e454ffdef3216a90332',
//   '0x729b48fb8cd28f6607303d518c639d9b8bf1390d65b87e5d2360a6465315c061',
//   '0x13918f67d67a951119b37fb9c2011ef3e3fdac7ac8bb6c1124bbf2d573ef6cc5',
//   '0xcc75d731e8620faea3d13b46db56987f4a344f3fd5130412c1d47027b96426e1',
//   '0xba1b0f1bd3256a3cc98e0e271ecaf1e31d6b9d0ae57a628fd47c2dd155f83e99',
//   '0x43c7d50a091c4ef66ae29b7db28f3af3cc096c49445b0349f893dcd050e2901d',
//   '0xb83b007ead2598673101668b8871df5a5a9ae00e8fb5adea950a1922e24d5fda',
//   '0x24a56a59130493f903a85e95c64c8eb7330d8271ae679a79bc1fc205417efe50'
// ]
// randomIdx 9
