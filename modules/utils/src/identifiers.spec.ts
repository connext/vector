import { expect } from "chai";

import { getPublicIdentifierError, getRandomIdentifier } from "./identifiers";

describe("Identifiers", () => {
  it("should generate a valid random public identifier", async () => {
    expect(getPublicIdentifierError(getRandomIdentifier())).to.be.undefined;
  });
});
