import { getEthProvider } from "@connext/vector-utils";
import { Wallet, utils } from "ethers";
import { Argv } from "yargs";

import { cliOpts } from "../constants";
import { getAddressBook, isContractDeployed, deployContract } from "../utils";

const initialSupply = utils.parseEther("100000000");

const name = "TestToken";

export const newToken = async (
  wallet: Wallet,
  addressBookPath: string,
  force = false,
  silent = false,
): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const log = silent ? () => {} : console.log;

  const chainId = process?.env?.REAL_CHAIN_ID || (await wallet.provider.getNetwork()).chainId;
  if (chainId === 1 && !force) {
    log(`Will not deploy new token to mainnet`);
    return;
  }
  const addressBook = getAddressBook(addressBookPath, chainId.toString());
  const savedAddress = addressBook.getEntry(name).address;
  if (force || !(await isContractDeployed(name, savedAddress, addressBook, wallet.provider, silent))) {
    log(`Preparing to deploy new token to chain w id: ${chainId}\n`);
    const token = await deployContract(name, [ "TEST", name ], wallet, addressBook, silent);
    log(`Success!`);
    await token.mint(wallet.address, initialSupply);
    log(
      `Minted ${utils.formatEther(initialSupply)} tokens & gave them all to ${wallet.address}`,
    );
  } else {
    log(`Token is up to date, no action required`);
    log(`Address: ${savedAddress}`);
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
      .option("f", cliOpts.force)
      .option("s", cliOpts.silent);
  },
  handler: async (argv: { [key: string]: any } & Argv["argv"]): Promise<void> => {
    await newToken(
      Wallet.fromMnemonic(argv.mnemonic).connect(getEthProvider(argv.ethProvider)),
      argv.addressBook,
      argv.force,
      argv.silent,
    );
  },
};
