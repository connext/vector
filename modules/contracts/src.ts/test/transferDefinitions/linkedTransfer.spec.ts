import { Contract, ContractFactory, Wallet, utils, constants } from "ethers";
import { LinkedTransferState, LinkedTransferResolver, Balance } from "@connext/vector-types";
import {
  encodeLinkedTransferResolver,
  encodeLinkedTransferState,
  getRandomAddress,
  getRandomBytes32,
  keyify,
  expect,
} from "@connext/vector-utils";

import { LinkedTransfer } from "../../artifacts";
import { provider } from "../constants";

const { HashZero, Zero } = constants;

describe("LinkedTransfer", () => {
  let deployer: Wallet;
  let definition: Contract;

  const createLinkedHash = (preImage: string): string => {
    return utils.soliditySha256(["bytes32"], [preImage]);
  };

  beforeEach(async () => {
    deployer = provider.getWallets()[0];
    definition = await new ContractFactory(LinkedTransfer.abi, LinkedTransfer.bytecode, deployer).deploy();
    await definition.deployed();
  });

  const createInitialState = async (preImage: string): Promise<LinkedTransferState> => {
    const senderAddr = getRandomAddress();
    const receiverAddr = getRandomAddress();
    const transferAmount = "10000";
    const linkedHash = createLinkedHash(preImage);
    return {
      balance: {
        amount: [transferAmount, Zero.toString()],
        to: [senderAddr, receiverAddr],
      },
      linkedHash,
    };
  };

  const createTransfer = async (initialState: LinkedTransferState): Promise<boolean> => {
    const encodedState = encodeLinkedTransferState(initialState);
    return definition.functions.create(encodedState);
  };

  const resolveTransfer = async (
    initialState: LinkedTransferState,
    resolver: LinkedTransferResolver,
  ): Promise<Balance> => {
    const encodedState = encodeLinkedTransferState(initialState);
    const encodedResolver = encodeLinkedTransferResolver(resolver);
    const ret = (await definition.functions.resolve(encodedState, encodedResolver))[0];
    return keyify(initialState.balance, ret);
  };

  const validateResult = async (
    initialState: LinkedTransferState,
    resolver: LinkedTransferResolver,
    result: Balance,
  ): Promise<void> => {
    if (createLinkedHash(resolver.preImage) === initialState.linkedHash) {
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
        "Cannot create linked transfer with nonzero recipient balance",
      );
    });

    it("should fail create if linkedHash is empty", async () => {
      const preImage = getRandomBytes32();
      const initialState = await createInitialState(preImage);
      initialState.linkedHash = HashZero;
      await expect(createTransfer(initialState)).revertedWith("Cannot create linked transfer with empty linkedHash");
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
