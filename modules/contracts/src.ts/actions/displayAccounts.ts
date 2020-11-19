import { HDNode } from "@ethersproject/hdnode";
import { Wallet } from "@ethersproject/wallet";
import { Argv } from "yargs";

import { cliOpts, logger } from "../constants";

export const displayAccounts = async (mnemonic: string, log = logger.child({})): Promise<void> => {
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
};

export const displayCommand = {
  command: "display-accounts",
  describe: "Display contract test accounts",
  builder: (yargs: Argv): Argv => {
    return yargs.option("m", cliOpts.mnemonic);
  },
  handler: async (argv: { [key: string]: any } & Argv["argv"]): Promise<void> => {
    await displayAccounts(argv.mnemonic, logger.child({ level: "info" }));
  },
};
