import pino from "pino";
import { VectorChannelMessage, ChannelState } from "./types";

// NOTE: These are very simple type-specific utils
// To prevent cyclic dependencies, these should not be moved to the utils module
export const tidy = (str: string): string => `${str.replace(/\n/g, "").replace(/ +/g, " ")}`;

export const logger = pino();

export function isChannelMessage(msg: any): msg is VectorChannelMessage {
  if (msg?.error) return false;
  if (!msg?.data) return false;
}

export function isChannelState(blob: any): blob is ChannelState {
  if (!blob?.channelId) return false;
  if (!blob?.participants) return false;
  if (!blob?.chainId) return false;
  if (!blob?.latestNonce) return false;
}