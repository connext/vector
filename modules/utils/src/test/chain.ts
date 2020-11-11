import { TransactionReceipt, TransactionResponse } from "@ethersproject/abstract-provider";
import { BigNumber } from "@ethersproject/bignumber";

import { mkAddress, mkHash } from "./util";

export const createTestTxResponse = (
  overrides: Partial<TransactionResponse> = {},
): TransactionResponse => {
  const to = overrides.to ?? mkAddress("0x1111");
  const from = overrides.from ?? mkAddress("0x2222");
  const hash = overrides.hash ?? mkHash("0xade134");
  const blockHash = overrides.blockHash ?? mkHash("0xbbbbb");
  const blockNumber = overrides.blockNumber ?? 487;
  return {
    hash,
    to,
    from,
    data: mkHash(),
    value: BigNumber.from(10),
    chainId: 1,
    nonce: 43,
    gasLimit: BigNumber.from(123576),
    gasPrice: BigNumber.from(1657639),
    timestamp: Date.now(),
    raw: mkHash(),
    blockHash,
    blockNumber,
    confirmations: 0,
    wait: () =>
      Promise.resolve(
        createTestTxReceipt({ transactionHash: hash, to, from, contractAddress: to, blockHash, blockNumber }),
      ),
    ...overrides,
  };
};

export const createTestTxReceipt = (
  overrides: Partial<TransactionReceipt> = {},
): TransactionReceipt => {
  return {
    transactionHash: mkHash("0xaecb"),
    to: mkAddress("0x1111"),
    from: mkAddress("0x2222"),
    blockHash: mkHash("0xbbbbb"),
    blockNumber: 487,
    contractAddress: mkAddress("0xcccc"),
    transactionIndex: 3,
    root: mkHash(),
    gasUsed: BigNumber.from(1657639),
    logsBloom: "logs",
    logs: [],
    cumulativeGasUsed: BigNumber.from(1657639),
    byzantium: true,
    confirmations: 15,
    ...overrides,
  };
};
