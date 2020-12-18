import pino from "pino";

// While debugging tests, you can change this to be "info" or "debug"
export const logger = pino({ level: process.env.LOG_LEVEL || "silent" });
