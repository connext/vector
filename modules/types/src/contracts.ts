import { tidy } from "./utils";

export const BalanceEncoding = tidy(`tuple(
    uint256[] amount,
    address[] to
  )`);