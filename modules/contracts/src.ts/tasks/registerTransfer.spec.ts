import { TransferNames } from "@connext/vector-types";
import { expect } from "@connext/vector-utils";
import { Contract } from "@ethersproject/contracts";
import { deployments } from "hardhat";

import { alice } from "../tests";
import { getContract } from "../utils";

import { registerTransfer } from "./registerTransfer";

describe("registerTransfer", function() {
  this.timeout(120_000);
  let registry: Contract;

  beforeEach(async () => {
    await deployments.fixture(); // Start w fresh deployments
    registry = await getContract("TransferRegistry", alice);
  });

  it("should registry a new transfer", async () => {
    expect(registry.address).to.be.a("string");
    await expect(registerTransfer(TransferNames.HashlockTransfer, alice.address)).to.be.fulfilled;
  });
});
