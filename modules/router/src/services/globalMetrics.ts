import { register } from "prom-client";

import { signer } from "..";
import { IRouterMessagingService } from "./messaging";

export const startMetricsBroadcastTask = (interval: number, messaging: IRouterMessagingService): void => {
  setInterval(() => {
    metricsBroadcastTasks(messaging);
  }, interval);
};

export const metricsBroadcastTasks = async (messaging: IRouterMessagingService) => {
  const metrics = await register.metrics();
  await messaging.broadcastMetrics(signer.publicIdentifier, metrics);
};
