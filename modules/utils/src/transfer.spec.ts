import { AddressZero } from "@ethersproject/constants";

import { expect } from "./test/expect";
import { getRandomChannelSigner } from "./channelSigner";
import { getRandomIdentifier } from "./identifiers";
import { encodeTransferQuote, decodeTransferQuote } from "./transfers";

describe("Transfers", () => {
  it("should encode and decode quote properly", async () => {
    const router = getRandomChannelSigner();
    const quote = {
      routerIdentifier: router.publicIdentifier,
      amount: "100",
      assetId: AddressZero,
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
});
