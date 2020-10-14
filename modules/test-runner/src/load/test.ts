import { RestServerNodeService } from "@connext/vector-utils";
import PriorityQueue from "p-queue";

import { env } from "../utils";

import { AgentManager } from "./agent";

import { carolEvts, logger } from "./index";

export const cyclicalTransferTest = async (): Promise<void> => {
  const agentService = await RestServerNodeService.connect(
    env.carolUrl,
    logger.child({ module: "RestServerNodeService" }),
    carolEvts,
  );
  const manager = await AgentManager.connect(agentService);

  const killSwitch = await manager.startCyclicalTransfers();

  setTimeout(async () => {
    logger.warn({}, "Killing test");
    await killSwitch();
  }, 90_000);
};
