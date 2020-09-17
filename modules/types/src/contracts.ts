import { tidy } from "./utils";

export const BalanceEncoding = tidy(`tuple(
    uint256[2] amount,
    address[2] to
  )`);
