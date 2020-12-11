import { expect } from "@connext/vector-utils";
import { deployments } from "hardhat";

describe.only("deploy", function() {
  this.timeout(360_000);
  it("should run without error", async () => {
    await expect(deployments.fixture()).to.be.fulfilled;
  });
});

