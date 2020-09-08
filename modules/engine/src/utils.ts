import pino from "pino";
import { VectorChannelMessage, ChannelState } from "./types";

export type InboundChannelError = any;

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

export const delay = (ms: number): Promise<void> =>
  new Promise((res: any): any => setTimeout(res, ms));

export const delayAndThrow = (ms: number, msg = ""): Promise<undefined> =>
  new Promise((res: any, rej: any): any => setTimeout((): undefined => rej(new Error(msg)), ms));
