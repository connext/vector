export const mkAddress = (prefix = "0x"): string => prefix.padEnd(42, "0");
export const mkHash = (prefix = "0x"): string => prefix.padEnd(66, "0");
export const mkPubId = (prefix = "a1"): string => `indra${prefix}`.padEnd(55, "0");