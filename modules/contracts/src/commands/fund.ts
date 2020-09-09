import { Address, DecString } from "@connext/types";
import { getEthProvider } from "@connext/vector-utils";
import * as tokenArtifacts from "@openzeppelin/contracts/build/contracts/ERC20Mintable.json";
import { Contract, Wallet, constants, utils } from "ethers";
import { Argv } from "yargs";

import { cliOpts } from "../constants";

const { AddressZero, EtherSymbol } = constants;
const { formatEther, parseEther } = utils;

export const fund = async (
  sender: Wallet,
  recipient: Address,
  amount: DecString,
  tokenAddress?: Address,
): Promise<void> => {
  const fundAttempt = async () => {
    if (tokenAddress && tokenAddress !== AddressZero) {
      const token = new Contract(tokenAddress, tokenArtifacts.abi, sender);
      const tx = await token.transfer(recipient, parseEther(amount));
      console.log(`Sending ${amount} tokens to ${recipient} via tx ${tx.hash}`);
      await sender.provider.waitForTransaction(tx.hash);
      const recipientBal = `${formatEther(await token.balanceOf(recipient))} tokens`;
      const senderBal = `${formatEther(await token.balanceOf(sender.address))} tokens`;
      console.log(`Tx mined! New balances: recipient ${recipientBal} | sender ${senderBal}`);
    } else {
      const tx = await sender.sendTransaction({
        to: recipient,
        value: parseEther(amount),
      });
      if (!tx.hash) {
        throw new Error(`Unable to send transaction: ${JSON.stringify(tx)}`);
      }
      console.log(`Sending ${EtherSymbol} ${amount} to ${recipient} via tx: ${tx.hash}`);
      await sender.provider.waitForTransaction(tx.hash);
      const recipientBal = `${EtherSymbol} ${formatEther(
        await sender.provider.getBalance(recipient),
      )}`;
      const senderBal = `${EtherSymbol} ${formatEther(
        await sender.provider.getBalance(sender.address),
      )}`;
      console.log(`Tx mined! New balances: recipient ${recipientBal} | sender ${senderBal}`);
    }
  };

  try {
    await fundAttempt();
  } catch (e) {
    if (e.message.includes("the tx doesn't have the correct nonce")) {
      console.warn(`Wrong nonce, let's try one more time.`);
      await fundAttempt();
    } else {
      throw e;
    }
  }
};

export const fundCommand = {
  command: "fund",
  describe: "Fund an address with a chunk of ETH or tokens",
  builder: (yargs: Argv): Argv => {
    return yargs
      .option("a", cliOpts.tokenAddress)
      .option("f", cliOpts.fromMnemonic)
      .option("p", cliOpts.ethProvider)
      .option("t", cliOpts.toAddress)
      .option("q", cliOpts.amount)
      .demandOption(["p", "t"]);
  },
  handler: async (argv: { [key: string]: any } & Argv["argv"]): Promise<void> => {
    await fund(
      Wallet.fromMnemonic(argv.fromMnemonic).connect(getEthProvider(argv.ethProvider)),
      argv.toAddress,
      argv.amount,
      argv.tokenAddress,
    );
  },
};
