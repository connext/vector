import { AddressZero, Zero } from "@ethersproject/constants";
import { getEthProvider } from "@connext/vector-utils";
import { Wallet, utils } from "ethers";
import { Argv } from "yargs";

import { cliOpts } from "../constants";
import { getAddressBook } from "../addressBook";

import { deployContracts } from "./contracts";

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

  if (force) {
    // Remove old token entry so that deployContracts knows to deploy a new one
    addressBook.setEntry(name, { address: AddressZero });
  }

  await deployContracts(wallet, addressBook, [
    [name, [ "TEST", name ]],
  ]);

  const token = addressBook.getContract(name);
  if (token.balanceOf(wallet.address).eq(Zero)) {
    await token.mint(wallet.address, initialSupply);
    log(
      `Minted ${utils.formatEther(initialSupply)} tokens & gave them all to ${wallet.address}`,
    );
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
