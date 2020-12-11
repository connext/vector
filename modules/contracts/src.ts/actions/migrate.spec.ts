import { expect } from "@connext/vector-utils";

import { alice } from "../tests";

import { migrate } from "./migrate";

describe("migrate", function() {
  this.timeout(360_000);
  it("should run without error", async () => {
    await expect(migrate(alice)).to.be.fulfilled;
  });
});
