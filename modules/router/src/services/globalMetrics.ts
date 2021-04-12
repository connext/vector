import { HydratedProviders } from "@connext/vector-types";
import { BaseLogger } from "pino";

export const startMetricsBroadcastTask = (
  interval: number,
  logger: BaseLogger,
  hydratedProviders: HydratedProviders,
): void => {
  setInterval(() => {
    metricsBroadcastTasks(logger, hydratedProviders);
  }, interval);
};

export const metricsBroadcastTasks = async (logger: BaseLogger, hydratedProviders: HydratedProviders) => {};
