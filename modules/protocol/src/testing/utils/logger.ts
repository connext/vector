import pino from "pino";

import { env } from "./env";

export const getTestLoggers = (name: string, fast = 20, slow = 200): { log: pino.BaseLogger, timer: any } => {
  const log = pino({ level: env.logLevel, name });
  const timer = start => msg => {
    const diff = Date.now() - start;
    if (diff < fast) {
      log.debug(msg);
    } else if (diff < slow) {
      log.info(msg);
    } else {
      log.warn(msg);
    }
  };
  return { log, timer };
};
