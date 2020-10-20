import { expect } from "@connext/vector-utils";

import { alice, getTestAddressBook } from "../tests";

import { migrate } from "./migrate";

describe("migrate", () => {
  it("should run without error", async () => {
    await expect(migrate(alice, await getTestAddressBook(), false)).to.be.fulfilled;
  });
});
