import { BigNumber } from "ethers";

import { isBN, toBN } from "./bigNumbers";
import { abbreviate } from "./strings";

export function bigNumberifyJson<T = any>(json: any): T {
  return typeof json === "string"
    ? json
    : JSON.parse(JSON.stringify(json), (key: string, value: any): any =>
        value && value._hex ? toBN(value._hex) : value,
      );
}

export function deBigNumberifyJson<T = any>(json: any): T {
  return JSON.parse(JSON.stringify(json), (key: string, value: any) =>
    value && isBN(value) && value.toHexString ? value.toHexString() : value,
  );
}
// Give abrv = true to abbreviate hex strings and addresss to look like "0x6FEC..kuQk"
export const stringify = (value: any, abrv = false, spaces = 2): string =>
  JSON.stringify(
    value,
    (key: string, value: any): any =>
      value && value._hex
        ? BigNumber.from(value).toString()
        : abrv && value && typeof value === "string" && value.startsWith("indra")
        ? abbreviate(value)
        : abrv && value && typeof value === "string" && value.startsWith("0x") && value.length > 12
        ? abbreviate(value)
        : value,
    spaces,
  );

const nullify = (key: string, value: any) => (typeof value === "undefined" ? null : value);

export const safeJsonStringify = (value: any): string => {
  try {
    return typeof value === "string" ? value : JSON.stringify(value, nullify);
  } catch (e) {
    console.log(`Failed to safeJsonstringify value ${value}: ${e.message}`);
    return value;
  }
};

export function safeJsonParse<T = any>(value: any): T {
  try {
    return typeof value === "string" ? JSON.parse(value, nullify) : value;
  } catch (e) {
    console.log(`Failed to safeJsonParse value ${value}: ${e.message}`);
    return value;
  }
}

// ethers returns an array of [ <each value by index>, <each value by key> ]
// so we need to recursively clean this response before returning
export const keyify = (templateObj: any, dataObj: any, key?: string): Promise<any> => {
  const template = key ? templateObj[key] : templateObj;
  const data = key ? dataObj[key] : dataObj;
  let output;
  if (isBN(template) || typeof template !== "object") {
    output = data;
  } else if (typeof template === "object" && typeof template.length === "number") {
    output = [];
    for (const index in template) {
      output.push(keyify(template, data, index));
    }
  } else if (typeof template === "object" && typeof template.length !== "number") {
    output = {};
    for (const subkey in template) {
      output[subkey] = keyify(template, data, subkey);
    }
  } else {
    throw new Error(`Couldn't keyify, unrecogized key/value: ${key}/${data}`);
  }
  return output;
};
