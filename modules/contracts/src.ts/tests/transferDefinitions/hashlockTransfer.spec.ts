import { HashlockTransferState, HashlockTransferResolver, Balance } from "@connext/vector-types";
import {
  encodeHashlockTransferResolver,
  encodeHashlockTransferState,
  getRandomAddress,
  getRandomBytes32,
  keyify,
  expect,
} from "@connext/vector-utils";
import { HashZero, Zero } from "@ethersproject/constants";
import { Contract, ContractFactory, Wallet, utils } from "ethers";

import { HashlockTransfer } from "../../artifacts";
import { provider } from "../constants";

describe("HashlockTransfer", () => {
  let deployer: Wallet;
  let definition: Contract;

  const createlockHash = (preImage: string): string => {
    return utils.soliditySha256(["bytes32"], [preImage]);
  };

  beforeEach(async () => {
    deployer = provider.getWallets()[0];
    definition = await new ContractFactory(HashlockTransfer.abi, HashlockTransfer.bytecode, deployer).deploy();
    await definition.deployed();
  });

  const createInitialState = async (preImage: string): Promise<HashlockTransferState> => {
    const senderAddr = getRandomAddress();
    const receiverAddr = getRandomAddress();
    const transferAmount = "10000";
    const lockHash = createlockHash(preImage);
    const expiry = "0";
    return {
      balance: {
        amount: [transferAmount, Zero.toString()],
        to: [senderAddr, receiverAddr],
      },
      lockHash,
      expiry,
    };
  };

  const createTransfer = async (initialState: HashlockTransferState): Promise<boolean> => {
    const encodedState = encodeHashlockTransferState(initialState);
    return definition.functions.create(encodedState);
  };

  const resolveTransfer = async (
    initialState: HashlockTransferState,
    resolver: HashlockTransferResolver,
  ): Promise<Balance> => {
    const encodedState = encodeHashlockTransferState(initialState);
    const encodedResolver = encodeHashlockTransferResolver(resolver);
    const ret = (await definition.functions.resolve(encodedState, encodedResolver))[0];
    return keyify(initialState.balance, ret);
  };

  const validateResult = async (
    initialState: HashlockTransferState,
    resolver: HashlockTransferResolver,
    result: Balance,
  ): Promise<void> => {
    if (createlockHash(resolver.preImage) === initialState.lockHash) {
      // Payment completed
      expect(result.to).to.deep.equal(initialState.balance.to);
      expect(result.amount[0].toString()).to.eq("0");
      expect(result.amount[1].toString()).to.eq(initialState.balance.amount[0]);
    } else if (resolver.preImage === HashZero) {
      // Payment reverted
      expect(result.to).to.deep.equal(initialState.balance.to);
      expect(result.amount[0].toString()).to.eq(initialState.balance.amount[0]);
      expect(result.amount[1].toString()).to.eq(initialState.balance.amount[1]);
    } else {
      expect(false).to.be.true;
    }
  };

  it("should deploy", async () => {
    expect(definition.address).to.be.a("string");
  });

  describe("Create", () => {
    it("should create successfully", async () => {
      const preImage = getRandomBytes32();
      const initialState = await createInitialState(preImage);
      const res = await createTransfer(initialState);
      expect((res as any)[0]).to.be.true;
    });

    it("should fail create if receiver balance is nonzero", async () => {
      const preImage = getRandomBytes32();
      const initialState = await createInitialState(preImage);
      initialState.balance.amount[1] = initialState.balance.amount[0];
      await expect(createTransfer(initialState)).revertedWith(
        "Cannot create hashlock transfer with nonzero recipient balance",
      );
    });

    it("should fail create if lockHash is empty", async () => {
      const preImage = getRandomBytes32();
      const initialState = await createInitialState(preImage);
      initialState.lockHash = HashZero;
      await expect(createTransfer(initialState)).revertedWith("Cannot create hashlock transfer with empty lockHash");
    });
  });

  describe("Resolve", () => {
    it("should resolve successfully", async () => {
      const preImage = getRandomBytes32();
      const initialState = await createInitialState(preImage);
      const result = await resolveTransfer(initialState, { preImage });
      await validateResult(initialState, { preImage }, result);
    });

    it("should refund if preimage is HashZero", async () => {
      const preImage = getRandomBytes32();
      const initialState = await createInitialState(preImage);
      const result = await resolveTransfer(initialState, { preImage: HashZero });
      await validateResult(initialState, { preImage: HashZero }, result);
    });

    it("should fail if the hash generated does not match preimage", async () => {
      const preImage = getRandomBytes32();
      const initialState = await createInitialState(preImage);
      const incorrectPreImage = getRandomBytes32();
      await expect(resolveTransfer(initialState, { preImage: incorrectPreImage })).revertedWith(
        "Hash generated from preimage does not match hash in state",
      );
    });
  });
});
