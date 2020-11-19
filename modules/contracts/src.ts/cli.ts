import yargs from "yargs";

import { migrateCommand, registerTransferCommand, displayCommand } from "./actions";

yargs
  .command(migrateCommand)
  .command(registerTransferCommand)
  .command(displayCommand)
  .demandCommand(1, "Choose a command from the above list")
  .help().argv;
