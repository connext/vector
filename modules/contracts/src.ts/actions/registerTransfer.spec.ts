import { TransferNames } from "@connext/vector-types";
import { expect } from "@connext/vector-utils";
import { Contract } from "ethers";

import { AddressBook } from "../addressBook";
import { alice, getTestAddressBook } from "../tests";

import { deployContracts } from "./deployContracts";
import { registerTransfer } from "./registerTransfer";

describe("registerTransfer", () => {
  let addressBook: AddressBook;
  let registry: Contract;

  beforeEach(async () => {
    addressBook = await getTestAddressBook();
    await deployContracts(alice, addressBook, [
      ["HashlockTransfer", []],
      ["TransferRegistry", []],
    ]);
    registry = addressBook.getContract("TransferRegistry");
  });

  it("should registry a new transfer", async () => {
    expect(registry.address).to.be.a("string");
    await expect(
      registerTransfer(TransferNames.HashlockTransfer, alice, addressBook),
    ).to.be.fulfilled;
  });

});
