import { PublicIdentifier, IVectorChainReader, Result } from "@connext/vector-types";
import { utils } from "ethers";

import { getSignerAddressFromPublicIdentifier } from "./identifiers";

export const getCreate2MultisigAddress = async (
  initiatorIdentifier: PublicIdentifier,
  responderIdentifier: PublicIdentifier,
  chainId: number,
  channelFactoryAddress: string,
  chainReader: IVectorChainReader,
): Promise<Result<string, Error>> => {

  const proxyRes = await chainReader.getChannelFactoryBytecode(channelFactoryAddress, chainId);
  if (proxyRes.isError) {
    return proxyRes;
  }

  const mastercopyRes = await chainReader.getChannelMastercopyAddress(channelFactoryAddress, chainId);
  if (mastercopyRes.isError) {
    return mastercopyRes;
  }

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
                [`0x${proxyRes.getValue().replace(/^0x/, "")}`, mastercopyRes.getValue()],
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
