import { utils } from "ethers";

const { hexDataLength, hexlify, isHexString, getAddress, randomBytes } = utils;

////////////////////////////////////////
// Validators

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
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
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const isValidHexString = (value: any): boolean => !getHexStringError(value);

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const getAddressError = (value: any): string | undefined => {
  try {
    const hexError = getHexStringError(value, 20);
    if (hexError) return hexError;
    getAddress(value);
    return undefined;
  } catch (e) {
    return e.message;
  }
};
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const isValidAddress = (value: any): boolean => !getAddressError(value);

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const getBytes32Error = (value: any): string | undefined => {
  const hexStringError = getHexStringError(value, 32);
  if (hexStringError) return hexStringError;
  return undefined;
};
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const isValidBytes32 = (value: any): boolean => !getBytes32Error(value);

////////////////////////////////////////
// Generators

export const getRandomAddress = (): string => getAddress(hexlify(randomBytes(20)));
export const getRandomBytes32 = (): string => hexlify(randomBytes(32));
