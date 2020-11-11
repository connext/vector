import { expect } from "@connext/vector-utils";

import { alice, getTestAddressBook } from "../tests";

import { migrate } from "./migrate";

describe("migrate", function() {
  this.timeout(360_000);
  it("should run without error", async () => {
    await expect(migrate(alice, await getTestAddressBook())).to.be.fulfilled;
  });
});
