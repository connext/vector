import { getEthProvider } from "@connext/utils";
import { Wallet, Contract, constants, utils } from "ethers";
import { Argv } from "yargs";

import { ConnextToken } from "../artifacts";
import { cliOpts } from "../constants";
import { getAddressBook } from "../address-book";

const { EtherSymbol } = constants;
const { formatEther } = utils;

export const drip = async (
  recipient: Wallet, // wallet to send drip tx
  addressBookPath: string,
): Promise<void> => {
  if (!recipient || !addressBookPath) {
    throw new Error("Missing required arguments");
  }
  const dripAttempt = async () => {
    const chainId = process?.env?.REAL_CHAIN_ID || (await recipient.provider.getNetwork()).chainId;
    const addressBook = getAddressBook(addressBookPath, chainId.toString());
    const tokenAddress = addressBook.getEntry("Token").address;
    // NOTE: ConnextToken has drippable abi
    const token = new Contract(tokenAddress, ConnextToken.abi, recipient);

    // Log existing balances
    const ercBal0 = `CXT ${formatEther(await token.balanceOf(recipient.address))} tokens`;
    const ethBal0 = `${EtherSymbol} ${formatEther(await recipient.getBalance())}`;
    console.log(`Balances before funding: ${ercBal0} | ${ethBal0}`);

    const tx = await token.functions.drip();
    console.log(`Dripping tokens to ${recipient} via tx ${tx.hash}`);
    await recipient.provider.waitForTransaction(tx.hash);
    const ercBal1 = `CXT ${formatEther(await token.balanceOf(recipient.address))}`;
    const ethBal1 = `${EtherSymbol} ${formatEther(await recipient.getBalance())}`;
    console.log(`Tx mined! New balances: ${ercBal1} | ${ethBal1}`);
  };

  try {
    await dripAttempt();
  } catch (e) {
    if (e.message.includes("the tx doesn't have the correct nonce")) {
      console.warn(`Wrong nonce, let's try one more time.`);
      await dripAttempt();
    } else {
      throw e;
    }
  }
};

export const dripCommand = {
  command: "drip",
  describe: "Drip tokens to sender address",
  builder: (yargs: Argv): Argv => {
    return yargs
      .option("a", cliOpts.addressBook)
      .option("k", cliOpts.privateKey)
      .option("p", cliOpts.ethProvider)
      .demandOption(["k", "p"]);
  },
  handler: async (argv: { [key: string]: any } & Argv["argv"]): Promise<void> => {
    await drip(new Wallet(argv.privateKey, getEthProvider(argv.ethProvider)), argv.addressBook);
  },
};
