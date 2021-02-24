import { AddressZero } from "@ethersproject/constants";

import { expect } from "./test/expect";
import { getRandomChannelSigner } from "./channelSigner";
import { getRandomIdentifier } from "./identifiers";
import { encodeTransferQuote, decodeTransferQuote, encodeWithdrawalQuote, decodeWithdrawalQuote } from "./transfers";

describe("Transfers", () => {
  it("should encode and decode transfer quote properly", async () => {
    const router = getRandomChannelSigner();
    const quote = {
      routerIdentifier: router.publicIdentifier,
      amount: "100",
      assetId: AddressZero,
      chainId: 35,
      recipient: getRandomIdentifier(),
      recipientChainId: 1,
      recipientAssetId: AddressZero,
      fee: "35",
      expiry: (Date.now() + 30_000).toString(),
    };

    const encoded = encodeTransferQuote(quote);
    const decoded = decodeTransferQuote(encoded);

    expect(quote).to.be.deep.eq(decoded);
  });

  it("should encode and decode withdraw quote properly", async () => {
    const router = getRandomChannelSigner();
    const quote = {
      channelAddress: router.address,
      amount: "100",
      assetId: AddressZero,
      fee: "35",
      expiry: (Date.now() + 30_000).toString(),
    };

    const encoded = encodeWithdrawalQuote(quote);
    const decoded = decodeWithdrawalQuote(encoded);

    expect(quote).to.be.deep.eq(decoded);
  });
});
