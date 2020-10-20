import yargs from "yargs";

import { fundCommand, newTokenCommand } from "./actions";
import { migrateCommand } from "./migrate";

yargs
  .command(fundCommand)
  .command(migrateCommand)
  .command(newTokenCommand)
  .demandCommand(1, "Choose a command from the above list")
  .help().argv;
