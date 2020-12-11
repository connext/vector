import { TransferNames } from "@connext/vector-types";
import { expect } from "@connext/vector-utils";
import { Contract } from "@ethersproject/contracts";

import { alice } from "../tests";
import { getContract } from "../utils";

import { deployContracts } from "./deployContracts";
import { registerTransfer } from "./registerTransfer";

describe("registerTransfer", function() {
  this.timeout(120_000);
  let registry: Contract;

  beforeEach(async () => {
    await deployContracts(alice.address, [
      ["HashlockTransfer", []],
      ["TransferRegistry", []],
    ]);
    registry = await getContract("TransferRegistry", alice);
  });

  it("should registry a new transfer", async () => {
    expect(registry.address).to.be.a("string");
    await expect(registerTransfer(TransferNames.HashlockTransfer, alice)).to.be.fulfilled;
  });
});
