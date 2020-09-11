import { tidy } from "./utils";

export const BalanceEncoding = tidy(`tuple(
    address[] amount,
    uint256[] to
  )`);