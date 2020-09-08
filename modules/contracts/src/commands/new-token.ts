import { getEthProvider } from "@connext/utils";
import { Wallet, utils } from "ethers";
import { Argv } from "yargs";

import { getAddressBook } from "../address-book";
import { cliOpts } from "../constants";
import { isContractDeployed, deployContract } from "../deploy";

const initialSupply = utils.parseEther("100000000");

const newToken = async (wallet: Wallet, addressBookPath: string, force: boolean) => {
  const chainId = process?.env?.REAL_CHAIN_ID || (await wallet.provider.getNetwork()).chainId;
  if (chainId === 1 && !force) {
    console.log(`Will not deploy new token to mainnet`);
    return;
  }
  const addressBook = getAddressBook(addressBookPath, chainId.toString());
  const savedAddress = addressBook.getEntry("Token").address;
  if (force || !(await isContractDeployed("Token", savedAddress, addressBook, wallet.provider))) {
    console.log(`Preparing to deploy new token to chain w id: ${chainId}\n`);
    const constructorArgs = [
      { name: "symbol", value: "CXT" },
      { name: "name", value: "ConnextToken" },
      { name: "version", value: "1.0" },
      { name: "chainId", value: chainId.toString() },
    ];
    const token = await deployContract("Token", constructorArgs, wallet, addressBook);
    console.log(`Success!`);
    await token.ownerMint(wallet.address, initialSupply);
    console.log(
      `Minted ${utils.formatEther(initialSupply)} tokens & gave them all to ${wallet.address}`,
    );
  } else {
    console.log(`Token is up to date, no action required`);
    console.log(`Address: ${savedAddress}`);
  }
};

export const newTokenCommand = {
  command: "new-token",
  describe: "Deploy a new ERC20 token contract",
  builder: (yargs: Argv): Argv => {
    return yargs
      .option("a", cliOpts.addressBook)
      .option("m", cliOpts.mnemonic)
      .option("p", cliOpts.ethProvider)
      .option("f", cliOpts.force);
  },
  handler: async (argv: { [key: string]: any } & Argv["argv"]): Promise<void> => {
    await newToken(
      Wallet.fromMnemonic(argv.mnemonic).connect(getEthProvider(argv.ethProvider)),
      argv.addressBook,
      argv.force,
    );
  },
};
