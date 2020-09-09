import { expect } from "chai";

import { getRandomPublicKey, getPublicKeyError } from "./crypto";

describe("Crypto", () => {
  it("should generate a valid random public key", async () => {
    expect(getPublicKeyError(getRandomPublicKey())).to.be.undefined;
  });
});
