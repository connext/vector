import yargs from "yargs";

import { fundCommand } from "./commands/fund";
import { migrateCommand } from "./commands/migrate";
import { newTokenCommand } from "./commands/new-token";
import { useTokenCommand } from "./commands/use-token";

yargs
  .command(fundCommand)
  .command(migrateCommand)
  .command(newTokenCommand)
  .command(useTokenCommand)
  .demandCommand(1, "Choose a command from the above list")
  .help().argv;
