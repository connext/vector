import { TransferNames } from "@connext/vector-types";
import { expect } from "@connext/vector-utils";
import { Contract } from "@ethersproject/contracts";

import { AddressBook } from "../addressBook";
import { alice, getTestAddressBook } from "../tests";
import { getContract } from "../utils";

import { deployContracts } from "./deployContracts";
import { registerTransfer } from "./registerTransfer";

describe("registerTransfer", function() {
  this.timeout(120_000);
  let addressBook: AddressBook;
  let registry: Contract;

  beforeEach(async () => {
    addressBook = await getTestAddressBook();
    await deployContracts(alice.address, [
      ["HashlockTransfer", []],
      ["TransferRegistry", []],
    ]);
    registry = await getContract("TransferRegistry", alice);
  });

  it("should registry a new transfer", async () => {
    expect(registry.address).to.be.a("string");
    await expect(registerTransfer(TransferNames.HashlockTransfer, alice, addressBook)).to.be.fulfilled;
  });
});
