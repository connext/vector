import { HexString } from "@connext/vector-types";
import { BigNumber, BigNumberish } from "@ethersproject/bignumber";

export const isBN = BigNumber.isBigNumber;

// bigNumberifyJson & deBigNumberifyJson convert values between BigNumber & BigNumberJson
export type BigNumberJson = { _hex: HexString; _isBigNumber: true };

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const isBNJson = (value: any): boolean => !isBN(value) && !!value._hex;

export const toBN = (n: BigNumberish | BigNumberJson): BigNumber =>
  BigNumber.from(
    n && typeof (n as BigNumberJson)._hex === "string"
      ? (n as BigNumberJson)._hex
      : typeof n.toString === "function"
      ? n.toString()
      : "0",
  );

export const toBNJson = (n: BigNumberish | BigNumberJson): BigNumberJson => ({
  _hex: toBN(n).toHexString(),
  _isBigNumber: true,
});

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const getBigNumberError = (value: any): string | undefined =>
  isBN(value) ? undefined : `Value "${value}" is not a BigNumber`;

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const getBigNumberishError = (value: any): string | undefined => {
  try {
    toBN(value);
  } catch (e) {
    return `Value "${value}" is not BigNumberish: ${e.message}`;
  }
  return undefined;
};
