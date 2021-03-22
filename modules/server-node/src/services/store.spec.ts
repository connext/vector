import {
  getTestLoggers,
  mkPublicIdentifier,
  testStore,
} from "@connext/vector-utils";

import { PrismaStore } from "./store";
import { config } from "../config";

const name = "PrismaStore";
const { log } = getTestLoggers(name);
const pubId = mkPublicIdentifier();

testStore(name, () => new PrismaStore(config.dbUrl))
