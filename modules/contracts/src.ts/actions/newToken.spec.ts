import { expect } from "@connext/vector-utils";

import { addressBookPath, alice } from "../tests";

import { newToken } from "./newToken";

describe("newToken()", () => {
  it("should run without error", async () => {
    await expect(
      newToken(alice, addressBookPath, false, true),
    ).to.be.fulfilled;
  });
});
