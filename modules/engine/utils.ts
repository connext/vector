import pino from "pino";
import { VectorChannelMessage } from "./types";

// NOTE: These are very simple type-specific utils
// To prevent cyclic dependencies, these should not be moved to the utils module
export const tidy = (str: string): string => `${str.replace(/\n/g, "").replace(/ +/g, " ")}`;

export const logger = pino();

export function isChannelMessage(msg: any): msg is VectorChannelMessage {
  if (msg?.error) return false;
  if (!msg?.data) return false;
}