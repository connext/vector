import { getEthProvider } from "@connext/utils";
import { Argv } from "yargs";
import { providers } from "ethers";

import { cliOpts } from "../constants";

export const snapshot = async (ethProvider: providers.JsonRpcProvider): Promise<void> => {
  try {
    const snapshotId = await ethProvider.send("evm_snapshot", []);
    console.log(`Took an EVM snapshot, id: ${snapshotId}`);
  } catch (e) {
    console.log(`Failed to take an EVM snapshot: ${e.message}`);
  }
};

export const snapshotCommand = {
  command: "snapshot",
  describe: "Take a snapshot of the current EVM state (testnet only)",
  builder: (yargs: Argv): Argv => {
    return yargs.option("p", cliOpts.ethProvider);
  },
  handler: async (argv: { [key: string]: any } & Argv["argv"]): Promise<void> => {
    await snapshot(getEthProvider(argv.ethProvider));
  },
};
