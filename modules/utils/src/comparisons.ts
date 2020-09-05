import { BigNumber, BigNumberish } from "ethers";

import { getBigNumberishError } from "./bigNumbers";

// this contains all of the bn related validation
// all functions in this library will return `undefined` if the conditions are
// met, or a descriptive string if they are not
// naming is designed to:
// if (notLessThanOrEqualTo) {
//   throw new Error(notLessThanOrEqualTo)
// }

export const notBigNumberish = getBigNumberishError;

// return string when value is not greater than ceiling
export const notGreaterThan = (value: any, ceil: BigNumberish): string | undefined => {
  if (notBigNumberish(value)) {
    return notBigNumberish(value);
  }
  return BigNumber.from(value).gt(BigNumber.from(ceil))
    ? undefined
    : `Value (${value.toString()}) is not greater than ${ceil.toString()}`;
};

export const notGreaterThanOrEqualTo = (value: any, ceil: BigNumberish): string | undefined => {
  if (notBigNumberish(value)) {
    return notBigNumberish(value);
  }
  return BigNumber.from(value).gte(ceil)
    ? undefined
    : `Value (${value.toString()}) is not greater than or equal to ${ceil.toString()}`;
};

// return string when value is not less than floor
export const notLessThan = (value: any, floor: BigNumberish): string | undefined => {
  if (notBigNumberish(value)) {
    return notBigNumberish(value);
  }
  return BigNumber.from(value).lt(floor)
    ? undefined
    : `Value (${value.toString()}) is not less than ${floor.toString()}`;
};

export const notLessThanOrEqualTo = (value: any, floor: BigNumberish): string | undefined => {
  if (notBigNumberish(value)) {
    return notBigNumberish(value);
  }
  return BigNumber.from(value).lte(floor)
    ? undefined
    : `Value (${value.toString()}) is not less than or equal to ${floor.toString()}`;
};

export const notPositive = (value: any): string | undefined => {
  return notGreaterThanOrEqualTo(value, 0);
};

export const notNegative = (value: any): string | undefined => {
  if (notLessThan(0, value)) {
    return `Value ${value.toString()} is negative.`;
  }
  return undefined;
};
