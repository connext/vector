import pino from "pino";

// import { VectorChannelMessage, ChannelState } from "./types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type InboundChannelError = any;

// NOTE: These are very simple type-specific utils
// To prevent cyclic dependencies, these should not be moved to the utils module
export const tidy = (str: string): string => `${str.replace(/\n/g, "").replace(/ +/g, " ")}`;

export const logger = pino();

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isChannelMessage(msg: any): boolean {
  if (msg?.error) return false;
  if (!msg?.data) return false;
  return true;
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function isChannelState(blob: any): boolean {
  if (!blob?.channelId) return false;
  if (!blob?.participants) return false;
  if (!blob?.chainId) return false;
  if (!blob?.latestNonce) return false;
  return true;
}

export const delay = (ms: number): Promise<void> =>
  new Promise((res: any): any => setTimeout(res, ms));

export const delayAndThrow = (ms: number, msg = ""): Promise<undefined> =>
  new Promise((res: any, rej: any): any => setTimeout((): undefined => rej(new Error(msg)), ms));
