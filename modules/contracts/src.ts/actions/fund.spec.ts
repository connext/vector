import { expect } from "@connext/vector-utils";
import { AddressZero } from "@ethersproject/constants";

import { alice, bob } from "../tests";

import { fund } from "./fund";

describe("fund()", () => {
  it("should run without error", async () => {
    await expect(
      fund(alice, bob.address, "1", AddressZero, true),
    ).to.be.fulfilled;
  });
});
