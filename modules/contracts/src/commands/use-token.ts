import { getEthProvider } from "@connext/vector-utils";
import { providers } from "ethers";
import { Argv } from "yargs";

import { getAddressBook } from "../address-book";
import { cliOpts } from "../constants";

const useToken = async (
  ethProvider: providers.JsonRpcProvider,
  addressBookPath: string,
  tokenAddress: string,
) => {
  const chainId = process?.env?.REAL_CHAIN_ID || (await ethProvider.getNetwork()).chainId;
  const addressBook = getAddressBook(addressBookPath, chainId.toString());
  addressBook.setEntry("Token", { address: tokenAddress });
};

export const useTokenCommand = {
  command: "use-token",
  describe: "Set some tokenAddress",
  builder: (yargs: Argv): Argv => {
    return yargs
      .option("a", cliOpts.addressBook)
      .option("p", cliOpts.ethProvider)
      .option("t", cliOpts.tokenAddress)
      .demandOption(["t"]);
  },
  handler: async (argv: { [key: string]: any } & Argv["argv"]): Promise<void> => {
    await useToken(getEthProvider(argv.ethProvider), argv.addressBook, argv.tokenAddress);
  },
};
