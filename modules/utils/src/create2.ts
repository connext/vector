import { PublicIdentifier, IVectorChainReader, Result } from "@connext/vector-types";
import { utils } from "ethers";

import { getSignerAddressFromPublicIdentifier } from "./identifiers";

// Prefix & suffix come from
// https://github.com/solidstate-network/solidstate-contracts/blob/1681e931a68391a4a1c11de0268b2278fd52bb23/contracts/architecture/factory/MinimalProxyFactory.sol
export const getMinimalProxyInitCode = (mastercopyAddress: string): string =>
  `0x3d602d80600a3d3981f3363d3d373d3d3d363d73${
    mastercopyAddress.toLowerCase().replace(/^0x/, "")
  }5af43d82803e903d91602b57fd5bf3`;

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
                ["address", "address", "uint256"],
                [
                  getSignerAddressFromPublicIdentifier(initiatorIdentifier),
                  getSignerAddressFromPublicIdentifier(responderIdentifier),
                  chainId,
                ],
              ),
              utils.solidityKeccak256(
                ["bytes"],
                [getMinimalProxyInitCode(mastercopyRes.getValue())],
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
