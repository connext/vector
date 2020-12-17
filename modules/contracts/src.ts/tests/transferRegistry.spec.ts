/* eslint-disable @typescript-eslint/no-empty-function */
import { RegisteredTransfer } from "@connext/vector-types";
import { Contract } from "@ethersproject/contracts";
import { expect } from "chai";
import { deployments } from "hardhat";

import { getContract } from "../utils";

import { alice, rando } from "./constants";

describe("TransferRegistry.sol", function() {
  this.timeout(120_000);
  let transfer: Contract;
  let registry: Contract;
  let registryInfo: RegisteredTransfer;

  beforeEach(async () => {
    await deployments.fixture(); // Start w fresh deployments
    registry = await getContract("TransferRegistry", alice);
    // Just for these tests, reset the registry to it's initial state
    await (await registry.removeTransferDefinition("HashlockTransfer")).wait();
    await (await registry.removeTransferDefinition("Withdraw")).wait();
    transfer = await getContract("HashlockTransfer", alice);
    registryInfo = await transfer.getRegistryInformation();
  });

  describe("addTransferDefinition", () => {
    it("should work", async () => {
      await (await registry.addTransferDefinition(registryInfo)).wait();
      expect(await registry.getTransferDefinitions()).to.be.deep.eq([registryInfo]);
    });

    it("should fail IFF not called by the owner", async () => {
      await expect(registry.connect(rando).addTransferDefinition(registryInfo)).revertedWith(
        "Ownable: caller is not the owner",
      );
    });
  });

  describe("removeTransferDefinition", () => {
    beforeEach(async () => {
      await (await registry.addTransferDefinition(registryInfo)).wait();
    });

    it("should work", async () => {
      await (await registry.removeTransferDefinition("HashlockTransfer")).wait();
      expect(await registry.getTransferDefinitions()).to.be.deep.eq([]);
    });

    it("should fail IFF not called by the owner", async () => {
      await expect(registry.connect(rando).removeTransferDefinition(transfer.address)).revertedWith(
        "Ownable: caller is not the owner",
      );
    });
  });
});
