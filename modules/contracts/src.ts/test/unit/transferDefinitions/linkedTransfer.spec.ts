import { Contract, ContractFactory, Wallet, utils, constants } from "ethers";
import {
  LinkedTransferState,
  LinkedTransferStateEncoding,
  LinkedTransferResolverEncoding,
  LinkedTransferResolver,
  Balance,
} from "@connext/vector-types";
import { getRandomAddress, getRandomBytes32 } from "@connext/vector-utils";

import { LinkedTransfer } from "../../../artifacts";
import { expect, provider } from "../../utils";

const { HashZero, Zero } = constants;

describe.only("LinkedTransfer", () => {
  let deployer: Wallet;
  let definition: Contract;

  const encodeTransferState = (state: LinkedTransferState): string => {
    return utils.defaultAbiCoder.encode([LinkedTransferStateEncoding], [state]);
  };

  const encodeTransferResolver = (resolver: LinkedTransferResolver): string => {
    return utils.defaultAbiCoder.encode([LinkedTransferResolverEncoding], [resolver]);
  };

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
    const encodedState = encodeTransferState(initialState);
    return definition.functions.create(encodedState);
  };

  const resolveTransfer = async (
    initialState: LinkedTransferState,
    resolver: LinkedTransferResolver,
  ): Promise<Balance> => {
    const encodedState = encodeTransferState(initialState);
    const encodedResolver = encodeTransferResolver(resolver);
    return definition.functions.resolve(encodedState, encodedResolver);
  };

  const validateResult = async (
    initialState: LinkedTransferState,
    resolver: LinkedTransferResolver,
    result: Balance,
  ): Promise<void> => {
    const [value] = result as any;
    if (createLinkedHash(resolver.preImage) === initialState.linkedHash) {
      // Payment completed
      expect(value).to.deep.equal({
        ...initialState.balance,
        amount: [initialState.balance.amount[1], initialState.balance.amount[0]],
      });
    } else if (initialState.linkedHash === HashZero) {
      // Payment reverted
      expect(result).to.deep.equal(initialState.balance);
    }
  };

  it("should deploy", async () => {
    expect(definition.address).to.be.a("string");
  });

  describe("Create", () => {
    // TODO this fails on encoding -- why?
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

    it("should refund if linkedHash is HashZero", async () => {
      const preImage = getRandomBytes32();
      const initialState = await createInitialState(preImage);
      initialState.linkedHash = HashZero;
      const result = await resolveTransfer(initialState, { preImage });
      await validateResult(initialState, { preImage }, result);
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
