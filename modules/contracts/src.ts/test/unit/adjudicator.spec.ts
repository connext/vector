import { Contract, ContractFactory, Wallet } from "ethers";

import { Adjudicator } from "../../artifacts";
import { expect, provider } from "../utils";

describe("Adjudicator", () => {
  let deployer: Wallet;
  let adjudicator: Contract;

  beforeEach(async () => {
    deployer = provider.getWallets()[0];
    adjudicator = await new ContractFactory(Adjudicator.abi, Adjudicator.bytecode, deployer).deploy();
    await adjudicator.deployed();
  });

  it("should deploy", async () => {
    expect(adjudicator.address).to.be.a("string");
  });
});
