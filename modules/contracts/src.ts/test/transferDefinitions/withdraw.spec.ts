import { Contract, ContractFactory, Wallet, utils, constants } from "ethers";
import {
  WithdrawState,
  WithdrawStateEncoding,
  WithdrawResolverEncoding,
  WithdrawResolver,
  Balance,
} from "@connext/vector-types";
import {
  getRandomAddress,
  getRandomBytes32,
  signChannelMessage,
  recoverAddressFromChannelMessage,
  keyify,
  expect,
} from "@connext/vector-utils";

import { Withdraw } from "../../artifacts";
import { provider } from "../constants";

const { Zero } = constants;

describe("Withdraw", () => {
  let deployer: Wallet;
  let definition: Contract;
  let alice: Wallet;
  let bob: Wallet;

  const encodeTransferState = (state: WithdrawState): string => {
    return utils.defaultAbiCoder.encode([WithdrawStateEncoding], [state]);
  };

  const encodeTransferResolver = (resolver: WithdrawResolver): string => {
    return utils.defaultAbiCoder.encode([WithdrawResolverEncoding], [resolver]);
  };

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
      aliceSignature: await signChannelMessage(data, alice.privateKey),
      signers: [alice.address, bob.address],
      data,
      nonce: getRandomBytes32(),
      fee: "0",
    };
  };

  const createTransfer = async (initialState: WithdrawState): Promise<boolean> => {
    const encodedState = encodeTransferState(initialState);
    const ret = (await definition.functions.create(encodedState))[0];
    return ret;
  };

  const resolveTransfer = async (initialState: WithdrawState, resolver: WithdrawResolver): Promise<Balance> => {
    const encodedState = encodeTransferState(initialState);
    const encodedResolver = encodeTransferResolver(resolver);
    const ret = (await definition.functions.resolve(encodedState, encodedResolver))[0];
    return keyify(initialState.balance, ret);
  };

  const validateResult = async (
    initialState: WithdrawState,
    resolver: WithdrawResolver,
    result: Balance,
  ): Promise<void> => {
    if (await recoverAddressFromChannelMessage(initialState.data, resolver.bobSignature)) {
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
      const bobSignature = await signChannelMessage(data, bob.privateKey);
      const result = await resolveTransfer(initialState, { bobSignature });
      await validateResult(initialState, { bobSignature }, result);
    });

    it("should resolve successfully with fees", async () => {
      const data = getRandomBytes32();
      const initialState = await createInitialState(data);
      initialState.fee = "100";
      const bobSignature = await signChannelMessage(data, bob.privateKey);
      const result = await resolveTransfer(initialState, { bobSignature });
      await validateResult(initialState, { bobSignature }, result);
    });
  });
});
