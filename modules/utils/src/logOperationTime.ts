import pino from "pino";
import { performance } from 'perf_hooks';
import { getRandomBytes32 } from "@connext/vector-utils";

/// This method is used to log the start and end time of an executed method. We are using the
/// perf_hooks (performance) lib provided by node to calculate this - much more accurate than
/// Date.now(). On first call, a unique label string is generated and returned. On second call,
/// same label string should be passed in to measure and log the diff in time (i.e. amount of
/// time method took to execute in ms).
export const logOperationTime = (log: pino.BaseLogger, method: string, label?: string): string => {
  if (label) {
    const stopLabel = `${label}-stop`;
    const timestamp = performance.mark(stopLabel);
    const diff = performance.measure(method, label, stopLabel);
    const message = `${method} : finished @ ${timestamp}; took ${diff} ms`;
    // Depending on how long method took, up severity of logging call. This is a default
    // arrangement that was copied over from indra.
    if (diff < 2) {
      log.debug(message);
    } else if (diff < 200) {
      log.info(message);
    } else {
      log.warn(message);
    }
  } else {
    // Generate the label we'll be using (for later ref) using unique hexstring.
    const label = `${method}-${getRandomBytes32()}`;
    performance.mark(label);
    const message = `${method}: started`;
    log.debug(message);
  }
  return label;
};
