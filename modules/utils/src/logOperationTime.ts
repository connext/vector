import pino from "pino";
import { performance } from 'perf_hooks';

/// This method is used to log the start and end time of an executed method. We are using the
/// perf_hooks (performance) lib provided by node to calculate this - much more accurate than
/// Date.now(). On first call, a unique label string is generated and returned. On second call,
/// same label string should be passed in to measure and log the diff in time (i.e. amount of
/// time method took to execute in ms).
export const logOperationTime = (log: pino.BaseLogger, method: string, methodId: string, startMark?: string): string => {
  const mark = `${method}-${methodId}`
  if (startMark) {
    const stopMark = `${mark}-stop`;
    const timestamp = performance.mark(stopMark);
    performance.measure(mark, startMark, stopMark);
    const diff = performance.getEntries({name : mark, entryType: "measure"});

    // Depending on how long method took, up severity of logging call. This is a default
    // arrangement that was copied over from indra.
    const message = `${method} : finished; took ${diff} ms`;
    if (diff < 2) {
      log.debug(message);
    } else if (diff < 200) {
      log.info(message);
    } else {
      log.warn(message);
    }
  } else {
    // Generate the label we'll be using (for later ref) using unique hexstring.
    const startMark = `${mark}-start`;
    performance.mark(startMark);
    // Debug log notify method started.
    const message = `${method}: started`;
    log.debug(message);
  }
  // We return the startMark so it can be passed back in for later method call.
  return startMark;
};
