import { utils } from "ethers";

const { hexDataLength, isHexString } = utils;

export const getHexStringError = (value: any, length?: number): string | undefined => {
    if (typeof value !== "string") {
      return `Invalid hex string: ${value} is a ${typeof value}, expected a string`;
    }
    if (!value.startsWith("0x")) {
      return `Invalid hex string: ${value} doesn't start with 0x`;
    }
    if (!isHexString(value)) {
      return `Invalid hex string: ${value}`;
    }
    if (length && hexDataLength(value) !== length) {
      return `Invalid hex string of length ${length}: ${value} is ${hexDataLength(value)} bytes long`;
    }
    return undefined;
  };

export const isValidHexString = (value: any): boolean => !getHexStringError(value);