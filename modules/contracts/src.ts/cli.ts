import yargs from "yargs";

import { migrateCommand, registerTransferCommand } from "./actions";

yargs
  .command(migrateCommand)
  .command(registerTransferCommand)
  .demandCommand(1, "Choose a command from the above list")
  .help().argv;
