import { PublicIdentifier, IVectorOnchainService, Result } from "@connext/vector-types";
import { utils } from "ethers";

import { getSignerAddressFromPublicIdentifier } from "./identifiers";

export const getCreate2MultisigAddress = async (
  initiatorIdentifier: PublicIdentifier,
  responderIdentifier: PublicIdentifier,
  chainId: number,
  channelFactoryAddress: string,
  channelMastercopyAddress: string,
  onchainTxService: IVectorOnchainService,
): Promise<Result<string, Error>> => {
  console.log("initiatorIdentifier: ", initiatorIdentifier);
  console.log("responderIdentifier: ", responderIdentifier);
  console.log("chainId: ", chainId);
  console.log("channelFactoryAddress: ", channelFactoryAddress);
  console.log("channelMastercopyAddress: ", channelMastercopyAddress);
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
                [`0x${proxyBytecode.replace(/^0x/, "")}`, channelMastercopyAddress],
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
