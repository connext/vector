/* eslint-disable @typescript-eslint/no-empty-function */
import { RegisteredTransfer } from "@connext/vector-types";
import { Contract } from "ethers";
import { expect } from "chai";

import { deployContracts } from "..";
import { AddressBook } from "../addressBook";

import { rando } from "./constants";

import { getTestAddressBook, alice } from ".";

describe("TransferRegistry.sol", () => {
  let addressBook: AddressBook;
  let transfer: Contract;
  let registry: Contract;
  let registryInfo: RegisteredTransfer;

  beforeEach(async () => {
    addressBook = await getTestAddressBook();

    await deployContracts(alice, addressBook, [
      ["HashlockTransfer", []],
      ["TransferRegistry", []],
    ]);
    registry = addressBook.getContract("TransferRegistry");
    transfer = addressBook.getContract("HashlockTransfer");
    registryInfo = await transfer.getRegistryInformation();
  });

  describe("addTransferDefinition", () => {
    it("should work", async () => {
      await registry.addTransferDefinition(registryInfo);
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
      await registry.addTransferDefinition(registryInfo);
    });
    it("should work", async () => {
      await registry.removeTransferDefinition("HashlockTransfer");
      expect(await registry.getTransferDefinitions()).to.be.deep.eq([]);
    });

    it("should fail IFF not called by the owner", async () => {
      await expect(registry.connect(rando).removeTransferDefinition(transfer.address)).revertedWith(
        "Ownable: caller is not the owner",
      );
    });
  });
});
