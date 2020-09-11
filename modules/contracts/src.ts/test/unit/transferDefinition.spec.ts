import { Contract, ContractFactory, Wallet, utils } from "ethers";

import { TransferDefinition } from "../../artifacts";
import { expect, provider } from "../utils";

describe("TransferDefinition", () => {
  let deployer: Wallet;
  let definition: Contract;

  beforeEach(async () => {
    deployer = provider.getWallets()[0];
    definition = await new ContractFactory(TransferDefinition.abi, TransferDefinition.bytecode, deployer).deploy();
    await definition.deployed();
  });

  it("should deploy", async () => {
    expect(definition.address).to.be.a("string");
  });

  it("should revert on create", async () => {
    await expect(definition.functions.create(utils.randomBytes(64))).revertedWith("The create method has no implementation for this TransferDefinition");
  });

  it("should revert on resolve", async () => {
    await expect(definition.functions.resolve(utils.randomBytes(64))).revertedWith("The resolve method has no implementation for this TransferDefinition");
  });
});
