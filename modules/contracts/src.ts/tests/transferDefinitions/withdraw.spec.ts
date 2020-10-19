import {
  WithdrawState,
  WithdrawResolver,
  Balance,
  WithdrawStateEncoding,
  WithdrawResolverEncoding,
} from "@connext/vector-types";
import {
  getRandomAddress,
  getRandomBytes32,
  signChannelMessage,
  recoverAddressFromChannelMessage,
  keyify,
  expect,
  encodeTransferState,
  encodeTransferResolver,
  encodeBalance,
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

  const createInitialState = async (data: string): Promise<{ state: WithdrawState; balance: Balance }> => {
    return {
      balance: {
        amount: ["10000", Zero.toString()],
        to: [getRandomAddress(), getRandomAddress()],
      },
      state: {
        initiatorSignature: await signChannelMessage(data, alice.privateKey),
        initiator: alice.address,
        responder: bob.address,
        data,
        nonce: getRandomBytes32(),
        fee: "0",
      },
    };
  };

  const createTransfer = async (balance: Balance, initialState: WithdrawState): Promise<boolean> => {
    const encodedState = encodeTransferState(initialState, WithdrawStateEncoding);
    const encodedBalance = encodeBalance(balance);
    const ret = (await definition.functions.create(encodedBalance, encodedState))[0];
    return ret;
  };

  const resolveTransfer = async (
    balance: Balance,
    initialState: WithdrawState,
    resolver: WithdrawResolver,
  ): Promise<Balance> => {
    const encodedState = encodeTransferState(initialState, WithdrawStateEncoding);
    const encodedResolver = encodeTransferResolver(resolver, WithdrawResolverEncoding);
    const encodedBalance = encodeBalance(balance);
    const ret = (await definition.functions.resolve(encodedBalance, encodedState, encodedResolver))[0];
    return keyify(balance, ret);
  };

  const validateResult = async (
    initialBalance: Balance,
    initialState: WithdrawState,
    resolver: WithdrawResolver,
    result: Balance,
  ): Promise<void> => {
    if (await recoverAddressFromChannelMessage(initialState.data, resolver.responderSignature)) {
      // Withdraw completed
      expect(result.to).to.deep.equal(initialBalance.to);
      expect(result.amount[0].toString()).to.eq("0");
      expect(result.amount[1].toString()).to.eq(initialState.fee.toString());
    } else {
      // Payment reverted
      expect(result).to.deep.equal(initialBalance);
    }
  };

  it("should deploy", async () => {
    expect(definition.address).to.be.a("string");
  });

  it.skip("should return the registry information", async () => {});

  describe("Create", () => {
    it("should create successfully", async () => {
      const data = getRandomBytes32();
      const { balance, state } = await createInitialState(data);
      expect(await createTransfer(balance, state)).to.be.true;
    });

    it.skip("should fail if recipient has nonzero balance", async () => {});
    it.skip("should fail if there are no signers", async () => {});
    it.skip("should fail if there is no data", async () => {});
    it.skip("should fail if the fee is greater than the withdrawal amount", async () => {});
    it.skip("should fail if the initiators signature is incorrect", async () => {});
  });

  describe("Resolve", () => {
    it("should resolve successfully", async () => {
      const data = getRandomBytes32();
      const { balance, state } = await createInitialState(data);
      const responderSignature = await signChannelMessage(data, bob.privateKey);
      const result = await resolveTransfer(balance, state, { responderSignature });
      await validateResult(balance, state, { responderSignature }, result);
    });

    it("should resolve successfully with fees", async () => {
      const data = getRandomBytes32();
      const { balance, state } = await createInitialState(data);
      state.fee = "100";
      const responderSignature = await signChannelMessage(data, bob.privateKey);
      const result = await resolveTransfer(balance, state, { responderSignature });
      await validateResult(balance, state, { responderSignature }, result);
    });

    it.skip("should fail if the initiators signature is invalid", async () => {});
    it.skip("should fail if the responder signature is invalid", async () => {});
    it.skip("should cancel if the responder gives no signature", async () => {});
  });
});
