import { expect } from "@connext/vector-utils";

import { migrate } from "../migrate";
import { addressBookPath, alice } from "../tests";

describe("migrate()", () => {
  it("should run without error", async () => {
    await expect(migrate(alice, addressBookPath, false)).to.be.fulfilled;
  });
});
