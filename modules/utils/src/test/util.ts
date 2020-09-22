export const isValidHex = (value = ""): boolean => {
  const hexRegex = new RegExp("/[0-9a-fA-F]+/", "i");
  return hexRegex.test(value);
};

export const mkAddress = (value = "0"): string => {
  return mkHexString(value, 40);
};

export const mkPublicIdentifier = (value = "A"): string => {
  return mkB58String(value);
};

export const mkHash = (value = ""): string => {
  return mkHexString(value, 64);
};

export const mkBytes32 = (value = "a"): string => {
  return mkHexString(value, 64);
};

export const mkSig = (value = "a"): string => {
  return mkHexString(value, 130);
};

export const mkHexString = (value = "0", length = 64, prefix = "0x", padding = "0"): string => {
  if (!isValidHex(value)) {
    throw new Error(`Invalid hex: ${value}`);
  }
  return prefix + value.padStart(length, padding);
};

export const mkB58String = (value = "0", length = 50, prefix = "indra", padding = "1"): string => {
  return prefix + value.padStart(length, padding);
};
