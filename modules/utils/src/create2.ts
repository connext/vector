import { Contract, PublicIdentifier, IVectorOnchainService, Result } from "@connext/vector-types";
import { utils } from "ethers";

import { getSignerAddressFromPublicIdentifier } from "./identifiers";

/**
 * Computes the address of a counterfactual MinimumViableMultisig contract
 * as it would be if deployed via the `createProxyWithNonce` method on a
 * ProxyFactory contract with the bytecode of a Proxy contract pointing to
 * a `masterCopy` of a MinimumViableMultisig contract.
 *
 * See https://solidity.readthedocs.io/en/v0.5.11/assembly.html?highlight=create2
 * for information on how CREAT2 addresses are calculated.
 *
 * @export
 * @param {string[]} owners - the addresses of the owners of the multisig
 * @param {string} addresses - critical addresses required to deploy multisig
 * @param {string} ethProvider - to fetch proxyBytecode from the proxyFactoryAddress
 *
 * @returns {string} the address of the multisig
 *
 * NOTE: if the encoding of the multisig owners is changed YOU WILL break all
 * existing channels
 */
// keccak256( 0xff ++ address ++ salt ++ keccak256(init_code))[12:]
export const getCreate2MultisigAddress = async (
  initiatorIdentifier: PublicIdentifier,
  responderIdentifier: PublicIdentifier,
  chainId: number,
  channelFactoryAddress: string,
  vectorChannelMastercopyAddress: string,
  onchainTxService: IVectorOnchainService,
): Promise<Result<string, Error>> => {
  const proxyRes = await onchainTxService.getChannelFactoryBytecode(channelFactoryAddress, chainId);
  if (proxyRes.isError) {
    return proxyRes;
  }
  const proxyBytecode = proxyRes.getValue();

  try {
    return Result.ok(
      utils.getAddress(
        utils
          .solidityKeccak256(
            ["bytes1", "address", "uint256", "bytes32"],
            [
              "0xff",
              channelFactoryAddress,
              // salt
              utils.solidityKeccak256(
                ["address", "address", "uint256", "bytes32"],
                [
                  getSignerAddressFromPublicIdentifier(initiatorIdentifier),
                  getSignerAddressFromPublicIdentifier(responderIdentifier),
                  chainId,
                  utils.keccak256(utils.toUtf8Bytes("vector")),
                ],
              ),
              utils.solidityKeccak256(
                ["bytes", "uint256"],
                [`0x${proxyBytecode.replace(/^0x/, "")}`, vectorChannelMastercopyAddress],
              ),
            ],
          )
          .slice(-40),
      ),
    );
  } catch (e) {
    return Result.fail(e);
  }
};
