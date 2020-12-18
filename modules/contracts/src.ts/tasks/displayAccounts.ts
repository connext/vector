import { HDNode } from "@ethersproject/hdnode";
import { Wallet } from "@ethersproject/wallet";
import { task } from "hardhat/config";
import pino from "pino";

export default task("display-accounts", "Displays first 3 accounts and their recommended gifts")
  .addParam("mnemonic", "The mnemonic to display accounts for")
  .addOptionalParam("logLevel", "One of 'debug', 'info', 'warn', 'error', 'silent' (default: info)")
  .setAction(async (args): Promise<void> => {
    const { mnemonic, logLevel } = args;
    const log = pino({ level: logLevel || "info" });
    const hdNode = HDNode.fromMnemonic(mnemonic).derivePath("m/44'/60'/0'/0");
    const wallets: Wallet[] = Array(20)
      .fill(0)
      .map((_, idx) => {
        const wallet = new Wallet(hdNode.derivePath(idx.toString()).privateKey);
        return wallet;
      });
    log.info(
      { wallets: wallets.map(w => w.address), privateKeys: wallets.map(w => w.privateKey) },
      "All contract testing accounts",
    );
    log.info({ alice: wallets[0].address, recommended: "1 ETH" }, "Alice");
    log.info({ bob: wallets[1].address, recommended: "0.5 ETH" }, "Bob");
    log.info({ rando: wallets[2].address, recommended: "0.1 ETH" }, "Rando");
  });
