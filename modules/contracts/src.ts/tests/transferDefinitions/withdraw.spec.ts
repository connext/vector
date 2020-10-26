/* eslint-disable @typescript-eslint/no-empty-function */
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
  keyify,
  expect,
  encodeTransferState,
  encodeTransferResolver,
  encodeBalance,
  mkSig,
} from "@connext/vector-utils";
import { AddressZero, HashZero, Zero } from "@ethersproject/constants";
import { BigNumber, Contract } from "ethers";

import { deployContracts } from "../../actions";
import { AddressBook } from "../../addressBook";
import { alice, bob } from "../constants";
import { getTestAddressBook } from "../utils";

describe("Withdraw", () => {
  let addressBook: AddressBook;
  let withdraw: Contract;

  beforeEach(async () => {
    addressBook = await getTestAddressBook();
    await deployContracts(alice, addressBook, [["Withdraw", []]]);
    withdraw = addressBook.getContract("Withdraw");
  });

  const createInitialState = async (
    data: string,
    overrides: { state?: Partial<WithdrawState>; balance?: Partial<Balance> } = { balance: {}, state: {} },
  ): Promise<{ state: WithdrawState; balance: Balance }> => {
    return {
      balance: {
        amount: ["10000", Zero.toString()],
        to: [getRandomAddress(), getRandomAddress()],
        ...(overrides.balance ?? {}),
      },
      state: {
        initiatorSignature: await signChannelMessage(data, alice.privateKey),
        initiator: alice.address,
        responder: bob.address,
        data,
        nonce: getRandomBytes32(),
        fee: "0",
        ...(overrides.state ?? {}),
      },
    };
  };

  const createTransfer = async (balance: Balance, initialState: WithdrawState): Promise<boolean> => {
    const encodedState = encodeTransferState(initialState, WithdrawStateEncoding);
    const encodedBalance = encodeBalance(balance);
    const ret = (await withdraw.functions.create(encodedBalance, encodedState))[0];
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
    const ret = (await withdraw.functions.resolve(encodedBalance, encodedState, encodedResolver))[0];
    return keyify(balance, ret);
  };

  const validateResult = async (
    initialBalance: Balance,
    initialState: WithdrawState,
    resolver: WithdrawResolver,
    result: Balance,
  ): Promise<void> => {
    if (resolver.responderSignature !== mkSig("0x0")) {
      // Withdraw completed
      expect(result.to).to.deep.equal(initialBalance.to);
      expect(result.amount[0].toString()).to.eq("0");
      expect(result.amount[1].toString()).to.eq(initialState.fee.toString());
    } else {
      // Payment cancelled
      expect(result.amount[0].toString()).to.eq(initialBalance.amount[0]);
      expect(result.amount[1].toString()).to.eq(initialBalance.amount[1]);
      expect(result.to).to.deep.equal(initialBalance.to);
    }
  };

  it("should deploy", async () => {
    expect(withdraw.address).to.be.a("string");
  });

  it("should return the registry information", async () => {
    const registry = await withdraw.getRegistryInformation();
    expect(registry.name).to.be.eq("Withdraw");
    expect(registry.stateEncoding).to.be.eq(
      "tuple(bytes initiatorSignature, address initiator, address responder, bytes32 data, uint256 nonce, uint256 fee)",
    );
    expect(registry.resolverEncoding).to.be.eq("tuple(bytes responderSignature)");
    expect(registry.definition).to.be.eq(withdraw.address);
  });

  describe("Create", () => {
    it("should create successfully", async () => {
      const data = getRandomBytes32();
      const { balance, state } = await createInitialState(data);
      expect(await createTransfer(balance, state)).to.be.true;
    });

    it("should fail if recipient has nonzero balance", async () => {
      const { balance, state } = await createInitialState(getRandomBytes32(), { balance: { amount: ["0", "5"] } });
      await expect(createTransfer(balance, state)).revertedWith("Withdraw: NONZERO_RECIPIENT_BALANCE");
    });

    it("should fail if there is no responder", async () => {
      const { balance, state } = await createInitialState(getRandomBytes32(), {
        state: { responder: AddressZero },
      });
      await expect(createTransfer(balance, state)).revertedWith("Withdraw: EMPTY_SIGNERS");
    });

    it("should fail if there is no initiator", async () => {
      const { balance, state } = await createInitialState(getRandomBytes32(), {
        state: { initiator: AddressZero },
      });
      await expect(createTransfer(balance, state)).revertedWith("Withdraw: EMPTY_SIGNERS");
    });

    it("should fail if there is no data", async () => {
      const { balance, state } = await createInitialState(getRandomBytes32(), {
        state: { data: HashZero },
      });
      await expect(createTransfer(balance, state)).revertedWith("Withdraw: EMPTY_DATA");
    });

    it("should fail if the nonce is 0", async () => {
      const { balance, state } = await createInitialState(getRandomBytes32(), {
        state: { nonce: "0" },
      });
      await expect(createTransfer(balance, state)).revertedWith("Withdraw: EMPTY_NONCE");
    });

    it("Withdraw: INSUFFICIENT_BALANCE", async () => {
      const { balance, state } = await createInitialState(getRandomBytes32(), {
        state: { fee: BigNumber.from("10000000").toString() },
      });
      await expect(createTransfer(balance, state)).revertedWith("Withdraw: INSUFFICIENT_BALANCE");
    });

    it("should fail if the initiators signature is incorrect", async () => {
      const { balance, state } = await createInitialState(getRandomBytes32(), {
        state: { initiatorSignature: await signChannelMessage(getRandomBytes32(), alice.privateKey) },
      });
      await expect(createTransfer(balance, state)).revertedWith("Withdraw: INVALID_INITIATOR_SIG");
    });
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
      const { balance, state } = await createInitialState(data, { state: { fee: "100" } });
      const responderSignature = await signChannelMessage(data, bob.privateKey);
      const result = await resolveTransfer(balance, state, { responderSignature });
      await validateResult(balance, state, { responderSignature }, result);
    });

    it("should fail if the responder signature is invalid", async () => {
      const { balance, state } = await createInitialState(getRandomBytes32());
      const responderSignature = await signChannelMessage(getRandomBytes32(), bob.privateKey);
      await expect(resolveTransfer(balance, state, { responderSignature })).revertedWith(
        "Withdraw.resolve: INVALID_RESPONDER_SIG",
      );
    });

    it("should cancel if the responder gives empty signature", async () => {
      const { balance, state } = await createInitialState(getRandomBytes32());
      const result = await resolveTransfer(balance, state, { responderSignature: mkSig("0x0") });
      await validateResult(balance, state, { responderSignature: mkSig("0x0") }, result);
    });
  });
});
