import { WithdrawState, WithdrawResolver, Balance } from "@connext/vector-types";
import {
  getRandomAddress,
  getRandomBytes32,
  signChannelMessage,
  recoverAddressFromChannelMessage,
  keyify,
  expect,
  encodeTransferState,
  encodeTransferResolver,
} from "@connext/vector-utils";
import { Zero } from "@ethersproject/constants";
import { Contract, ContractFactory, Wallet } from "ethers";

import { Withdraw } from "../../artifacts";
import { provider } from "../constants";

describe("Withdraw", () => {
  let deployer: Wallet;
  let definition: Contract;
  let alice: Wallet;
  let bob: Wallet;

  beforeEach(async () => {
    deployer = provider.getWallets()[0];
    alice = provider.getWallets()[1];
    bob = provider.getWallets()[2];
    definition = await new ContractFactory(Withdraw.abi, Withdraw.bytecode, deployer).deploy();
    await definition.deployed();
  });

  const createInitialState = async (data: string): Promise<WithdrawState> => {
    return {
      balance: {
        amount: ["10000", Zero.toString()],
        to: [getRandomAddress(), getRandomAddress()],
      },
      initiatorSignature: await signChannelMessage(data, alice.privateKey),
      initiator: alice.address,
      responder: bob.address,
      data,
      nonce: getRandomBytes32(),
      fee: "0",
    };
  };

  const createTransfer = async (initialState: WithdrawState): Promise<boolean> => {
    const encodedState = encodeTransferState(initialState, await definition.stateEncoding());
    const ret = (await definition.functions.create(encodedState))[0];
    return ret;
  };

  const resolveTransfer = async (initialState: WithdrawState, resolver: WithdrawResolver): Promise<Balance> => {
    const encodedState = encodeTransferState(initialState, await definition.stateEncoding());
    const encodedResolver = encodeTransferResolver(resolver, await definition.resolverEncoding());
    const ret = (await definition.functions.resolve(encodedState, encodedResolver))[0];
    return keyify(initialState.balance, ret);
  };

  const validateResult = async (
    initialState: WithdrawState,
    resolver: WithdrawResolver,
    result: Balance,
  ): Promise<void> => {
    if (await recoverAddressFromChannelMessage(initialState.data, resolver.responderSignature)) {
      // Withdraw completed
      expect(result.to).to.deep.equal(initialState.balance.to);
      expect(result.amount[0].toString()).to.eq("0");
      expect(result.amount[1].toString()).to.eq(initialState.fee.toString());
    } else {
      // Payment reverted
      expect(result).to.deep.equal(initialState.balance);
    }
  };

  it("should deploy", async () => {
    expect(definition.address).to.be.a("string");
  });

  it("should get encodings", async () => {
    expect(await definition.stateEncoding()).to.be.eq(
      "tuple(tuple(uint256[2] amount, address[2] to) balance, bytes initiatorSignature, address initiator, address responder, bytes32 data, uint256 nonce, uint256 fee)",
    );
    expect(await definition.resolverEncoding()).to.be.eq("tuple(bytes responderSignature)");
  });

  describe("Create", () => {
    it("should create successfully", async () => {
      const data = getRandomBytes32();
      const initialState = await createInitialState(data);
      expect(await createTransfer(initialState)).to.be.true;
    });
  });

  describe("Resolve", () => {
    it("should resolve successfully", async () => {
      const data = getRandomBytes32();
      const initialState = await createInitialState(data);
      const responderSignature = await signChannelMessage(data, bob.privateKey);
      const result = await resolveTransfer(initialState, { responderSignature });
      await validateResult(initialState, { responderSignature }, result);
    });

    it("should resolve successfully with fees", async () => {
      const data = getRandomBytes32();
      const initialState = await createInitialState(data);
      initialState.fee = "100";
      const responderSignature = await signChannelMessage(data, bob.privateKey);
      const result = await resolveTransfer(initialState, { responderSignature });
      await validateResult(initialState, { responderSignature }, result);
    });
  });
});
