import yargs from "yargs";

import {
  fundCommand,
  migrateCommand,
  newTokenCommand,
} from "./actions";

yargs
  .command(fundCommand)
  .command(migrateCommand)
  .command(newTokenCommand)
  .demandCommand(1, "Choose a command from the above list")
  .help().argv;
