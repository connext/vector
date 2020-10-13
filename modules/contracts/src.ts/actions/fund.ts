import { Address, DecString } from "@connext/types";
import { getEthProvider } from "@connext/vector-utils";
import { AddressZero, EtherSymbol } from "@ethersproject/constants";
import * as tokenArtifacts from "@openzeppelin/contracts/build/contracts/IERC20.json";
import { Contract, Wallet, utils } from "ethers";
import { Argv } from "yargs";

import { cliOpts } from "../constants";

const { formatEther, parseEther } = utils;

export const fund = async (
  sender: Wallet,
  recipient: Address,
  amount: DecString,
  tokenAddress?: Address,
  silent = false,
): Promise<void> => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const log = silent ? () => {} : console.log;
  const fundAttempt = async () => {
    if (tokenAddress && tokenAddress !== AddressZero) {
      const token = new Contract(tokenAddress, tokenArtifacts.abi, sender);
      const tx = await token.transfer(recipient, parseEther(amount));
      log(`Sending ${amount} tokens to ${recipient} via tx ${tx.hash}`);
      await sender.provider.waitForTransaction(tx.hash);
      const recipientBal = `${formatEther(await token.balanceOf(recipient))} tokens`;
      const senderBal = `${formatEther(await token.balanceOf(sender.address))} tokens`;
      log(`Tx mined! New balances: recipient ${recipientBal} | sender ${senderBal}`);
    } else {
      const tx = await sender.sendTransaction({
        to: recipient,
        value: parseEther(amount),
      });
      if (!tx.hash) {
        throw new Error(`Unable to send transaction: ${JSON.stringify(tx)}`);
      }
      log(`Sending ${EtherSymbol} ${amount} to ${recipient} via tx: ${tx.hash}`);
      await sender.provider.waitForTransaction(tx.hash);
      const recipientBal = `${EtherSymbol} ${formatEther(
        await sender.provider.getBalance(recipient),
      )}`;
      const senderBal = `${EtherSymbol} ${formatEther(
        await sender.provider.getBalance(sender.address),
      )}`;
      log(`Tx mined! New balances: recipient ${recipientBal} | sender ${senderBal}`);
    }
  };

  try {
    await fundAttempt();
  } catch (e) {
    if (e.message.includes("the tx doesn't have the correct nonce")) {
      log(`Wrong nonce, let's try one more time.`);
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
      .option("q", cliOpts.amount)
      .option("s", cliOpts.silent)
      .option("t", cliOpts.toAddress)
      .demandOption(["p", "t"]);
  },
  handler: async (argv: { [key: string]: any } & Argv["argv"]): Promise<void> => {
    await fund(
      Wallet.fromMnemonic(argv.fromMnemonic).connect(getEthProvider(argv.ethProvider)),
      argv.toAddress,
      argv.amount,
      argv.tokenAddress,
      argv.silent,
    );
  },
};
