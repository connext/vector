/* eslint-disable @typescript-eslint/no-empty-function */
import { RegisteredTransfer } from "@connext/vector-types";
import { BigNumber } from "@ethersproject/bignumber";
import { Contract } from "@ethersproject/contracts";
import { expect } from "chai";

import { deployContracts } from "../../actions";
import { alice } from "../constants";
import { getTestAddressBook } from "../utils";

describe("LibIterableMapping.sol", function() {
  this.timeout(120_000);
  let mapping: Contract;
  let transferDefs: Contract[];

  // Helper function to load data into registry
  const loadMapping = async () => {
    // Load some data into the library
    for (const transfer of transferDefs) {
      const info = await transfer.getRegistryInformation();
      const tx = await mapping.addTransferDefinition(info);
      await tx.wait();
    }
  };

  beforeEach(async () => {
    const addressBook = await getTestAddressBook();
    await deployContracts(alice.address, [
      ["TestLibIterableMapping", []],
      ["HashlockTransfer", []],
      ["Withdraw", []],
    ]);
    mapping = addressBook.getContract("TestLibIterableMapping");
    expect(mapping.address).to.be.a("string");
    transferDefs = [addressBook.getContract("HashlockTransfer"), addressBook.getContract("Withdraw")];
  });

  describe("stringEqual", () => {
    it("should work", async () => {
      expect(await mapping.stringEqual("test", "test")).to.be.true;
      expect(await mapping.stringEqual("test", "fails")).to.be.false;
    });
  });

  describe("isEmptyString", () => {
    it("should work", async () => {
      expect(await mapping.isEmptyString("")).to.be.true;
      expect(await mapping.isEmptyString("test")).to.be.false;
    });
  });

  describe("nameExists", () => {
    it("should work", async () => {
      await loadMapping();
      expect(await mapping.nameExists("HashlockTransfer")).to.be.true;
    });

    it("should return false if name is empty", async () => {
      await loadMapping();
      expect(await mapping.nameExists("")).to.be.false;
    });

    it("should return false if contract.names is empty", async () => {
      expect(await mapping.nameExists("HashlockTransfer")).to.be.false;
    });

    it("should return false if name is not in contract.names", async () => {
      expect(await mapping.nameExists("Fail")).to.be.false;
    });
  });

  describe("length", () => {
    it("should work", async () => {
      expect(await mapping.length()).to.be.eq(0);
      await loadMapping();
      expect(await mapping.length()).to.be.eq(transferDefs.length);
    });
  });

  describe("getTransferDefinitionByName", () => {
    beforeEach(async () => await loadMapping());

    it("should work", async () => {
      const hashlockRegistry = await transferDefs[0].getRegistryInformation();
      expect(await mapping.getTransferDefinitionByName("HashlockTransfer")).to.be.deep.eq(hashlockRegistry);
    });

    it("should fail if name is an empty string", async () => {
      await expect(mapping.getTransferDefinitionByName("")).revertedWith("LibIterableMapping: EMPTY_NAME");
    });

    it("should fail if name is not in contract.names", async () => {
      await expect(mapping.getTransferDefinitionByName("Test")).revertedWith("LibIterableMapping: NAME_NOT_FOUND");
    });
  });

  describe("getTransferDefinitionByIndex", () => {
    beforeEach(async () => await loadMapping());

    it("should work", async () => {
      for (const transfer of transferDefs) {
        const idx = transferDefs.findIndex(t => t.address === transfer.address);
        const registry = await transferDefs[idx].getRegistryInformation();
        expect(await mapping.getTransferDefinitionByIndex(BigNumber.from(idx))).to.be.deep.eq(registry);
      }
    });

    it("should fail if index > self.names.length", async () => {
      await expect(mapping.getTransferDefinitionByIndex(BigNumber.from(2))).revertedWith(
        "LibIterableMapping: INVALID_INDEX",
      );
    });
  });

  describe("getTransferDefinitions", () => {
    beforeEach(async () => await loadMapping());

    it("should work", async () => {
      const info = await Promise.all(transferDefs.map(t => t.getRegistryInformation()));
      expect(await mapping.getTransferDefinitions()).to.be.deep.eq(info);
    });
  });

  describe("addTransferDefinition", () => {
    let info: RegisteredTransfer[];
    beforeEach(async () => {
      info = await Promise.all(transferDefs.map(t => t.getRegistryInformation()));
    });
    it("should work", async () => {
      await loadMapping();
      expect(await mapping.length()).to.be.eq(BigNumber.from(2));
      expect(await mapping.getTransferDefinitions()).to.be.deep.eq(info);
    });

    it("should fail if name is an empty string", async () => {
      await expect(mapping.addTransferDefinition({ ...info[0], name: "" })).revertedWith(
        "LibIterableMapping: EMPTY_NAME",
      );
    });

    it("should fail if name is in contract.names", async () => {
      await loadMapping();
      await expect(mapping.addTransferDefinition(info[0])).revertedWith("LibIterableMapping: NAME_NOT_FOUND");
    });
  });

  describe("removeTransferDefinition", () => {
    let info: RegisteredTransfer[];
    beforeEach(async () => {
      info = await Promise.all(transferDefs.map(t => t.getRegistryInformation()));
      await loadMapping();
    });

    it("should work with the last element", async () => {
      const tx = await mapping.removeTransferDefinition(info[1].name);
      await tx.wait();
      expect(await mapping.length()).to.be.eq(info.length - 1);
      expect(await mapping.nameExists(info[1].name)).to.be.false;
    });

    it("should work with another element than the last", async () => {
      const tx = await mapping.removeTransferDefinition(info[0].name);
      await tx.wait();
      expect(await mapping.length()).to.be.eq(info.length - 1);
      expect(await mapping.nameExists(info[0].name)).to.be.false;
    });

    it("should fail if name is an empty string", async () => {
      await expect(mapping.removeTransferDefinition("")).revertedWith("LibIterableMapping: EMPTY_NAME");
    });

    it("should fail if name is not in contract.names", async () => {
      await expect(mapping.removeTransferDefinition("Test")).revertedWith("LibIterableMapping: NAME_NOT_FOUND");
    });
  });
});
