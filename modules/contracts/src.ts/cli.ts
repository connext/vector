import yargs from "yargs";

import { registerTransferCommand, displayCommand } from "./actions";

yargs
  .command(registerTransferCommand)
  .command(displayCommand)
  .demandCommand(1, "Choose a command from the above list")
  .help().argv;
