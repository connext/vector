import { expect } from "@connext/vector-utils";

import { addressBookPath, alice } from "../tests";

import { migrate } from "./migrate";

describe("migrate()", () => {
  it("should run without error", async () => {
    await expect(
      migrate(alice, addressBookPath, true),
    ).to.be.fulfilled;
  });
});
