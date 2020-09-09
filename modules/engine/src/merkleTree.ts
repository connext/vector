import { ethers as eth } from 'ethers'

const { arrayify, concat, hexlify, isHexString, keccak256, padZeros } = eth.utils

const combinedHash = (first: string, second: string): string => {
  if (!second) { return first }
  if (!first) { return second }
  return keccak256(concat([first, second].sort()))
}

export class MerkleTree {
  public elements: string[]
  public root: string
  public layers: string[][]

  public constructor(_elements: string[]) {
    if (!_elements.every((e: string): boolean => isHexString(e) && arrayify(e).length === 32)) {
      throw new Error('Each element must be a 32 byte hex string')
    }

    // deduplicate elements
    this.elements = _elements.filter((element: string, i: number): boolean =>
      _elements.findIndex((e: string): boolean => element === e) === i,
    ).sort()

    // Can't have an odd number of leaves
    if (this.elements.length % 2 !== 0) {
      this.elements.push(eth.constants.HashZero)
    }

    // Build merkle tree layers
    this.layers = []
    // Set root to HashZero if given zero elements
    if (this.elements.length === 0) {
      this.layers.push([eth.constants.HashZero])
    } else {
      this.layers.push(this.elements)
      while (this.topLayer.length > 1) {
        this.layers.push(this.topLayer.reduce(
          (layer: string[], element: string, index: number, arr: string[]): string[] =>
            index % 2 ? layer : layer.concat([combinedHash(element, arr[index + 1])]),
          [],
        ))
      }
    }

    this.root = this.topLayer[0]
  }

  public get topLayer(): string[] {
    return this.layers[this.layers.length -1]
  }

  public proof(element: string): string {
    let index = this.elements.findIndex((e: string): boolean => e === element)
    if (index === -1) { throw new Error('element not found in merkle tree') }
    const proofArray = this.layers.reduce((proof: string[], layer: string[]): string[] => {
      const pairIndex: number = index % 2 ? index - 1 : index + 1
      if (pairIndex < layer.length) {
        proof.push(layer[pairIndex])
      }
      index = Math.floor(index / 2)
      return proof
    }, [element])
    return hexlify(concat(proofArray))
  }

  public verify(proof: string): boolean {
    const proofArray: RegExpMatchArray = proof.substring(2).match(/.{64}/g) || []
    if (!proofArray || proofArray.length * 64 !== proof.length -2) {
      console.warn(`Invalid proof: expected a hex string describing n 32 byte chunks`)
      return false
    }
    const proofs: string[] = proofArray.map((p: string): string => `0x${p.replace('0x', '')}`)
    return this.root === (proofs.slice(1).reduce(combinedHash, proofs[0]))
  }

}