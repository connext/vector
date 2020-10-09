import { TransferNames } from "@connext/vector-types";
import { expect } from "@connext/vector-utils";

import { addressBookPath, alice } from "../tests";

import { migrate } from "./migrate";
import { registerTransfer } from "./registerTransfer";

describe("registerTransfer()", () => {
  beforeEach(async () => {
    await expect(migrate(alice, addressBookPath, true)).to.be.fulfilled;
  });
  it("should run without error", async () => {
    await expect(registerTransfer(TransferNames.HashlockTransfer, alice, addressBookPath, false)).to.be.fulfilled;
  });
});
