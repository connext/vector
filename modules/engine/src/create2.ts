import { Contract, PublicIdentifier } from "@connext/vector-types";
import { getSignerAddressFromPublicIdentifier } from "@connext/vector-utils";
import { providers, utils } from "ethers";

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
export const getCreate2MultisigAddress = async (
  initiatorIdentifier: PublicIdentifier,
  responderIdentifier: PublicIdentifier,
  channelFactoryAddress: string,
  channelFactoryAbi: any,
  vectorChannelMastercopyAddress: string,
  vectorChannelMastercopyAddressAbi: any,
  ethProvider: providers.JsonRpcProvider,
): Promise<string> => {
  const proxyFactory = new Contract(channelFactoryAddress, channelFactoryAbi, ethProvider);

  const proxyBytecode = await proxyFactory.proxyCreationCode();

  return utils.getAddress(
    utils
      .solidityKeccak256(
        ["bytes1", "address", "uint256", "bytes32"],
        [
          "0xff",
          channelFactoryAddress,
          utils.solidityKeccak256(
            ["bytes32", "uint256"],
            [
              utils.keccak256(
                // see encoding notes
                new utils.Interface(vectorChannelMastercopyAddressAbi).encodeFunctionData("setup", [
                  [
                    getSignerAddressFromPublicIdentifier(initiatorIdentifier),
                    getSignerAddressFromPublicIdentifier(responderIdentifier),
                  ],
                ]),
              ),
              // hash chainId + saltNonce to ensure multisig addresses are *always* unique
              utils.solidityKeccak256(["uint256", "uint256"], [ethProvider.network.chainId, 0]),
            ],
          ),
          utils.solidityKeccak256(
            ["bytes", "uint256"],
            [`0x${proxyBytecode.replace(/^0x/, "")}`, vectorChannelMastercopyAddress],
          ),
        ],
      )
      .slice(-40),
  );
};
