/* eslint-disable @typescript-eslint/no-empty-function */
import {
  Balance,
  HashlockTransferResolverEncoding,
  HashlockTransferStateEncoding,
  HashlockTransferState,
  HashlockTransferResolver,
} from "@connext/vector-types";
import {
  getRandomAddress,
  getRandomBytes32,
  keyify,
  expect,
  encodeTransferResolver,
  encodeTransferState,
  encodeBalance,
} from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import { HashZero, Zero } from "@ethersproject/constants";
import { Contract } from "@ethersproject/contracts";
import { sha256 as soliditySha256 } from "@ethersproject/solidity";
import { deployments } from "hardhat";

import { getContract } from "../../utils";
import { alice, provider } from "../constants";

describe("HashlockTransfer", function() {
  this.timeout(120_000);
  let transfer: Contract;

  beforeEach(async () => {
    await deployments.fixture(); // Start w fresh deployments
    transfer = await getContract("HashlockTransfer", alice);
  });

  const createlockHash = (preImage: string): string => soliditySha256(["bytes32"], [preImage]);

  const createInitialState = async (preImage: string): Promise<{ state: HashlockTransferState; balance: Balance }> => {
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
      state: { lockHash, expiry },
    };
  };

  const createTransfer = async (balance: Balance, initialState: HashlockTransferState): Promise<boolean> => {
    const encodedState = encodeTransferState(initialState, HashlockTransferStateEncoding);
    const encodedBalance = encodeBalance(balance);
    return transfer.functions.create(encodedBalance, encodedState);
  };

  const resolveTransfer = async (
    balance: Balance,
    initialState: HashlockTransferState,
    resolver: HashlockTransferResolver,
  ): Promise<Balance> => {
    const encodedState = encodeTransferState(initialState, HashlockTransferStateEncoding);
    const encodedResolver = encodeTransferResolver(resolver, HashlockTransferResolverEncoding);
    const encodedBalance = encodeBalance(balance);
    const res = await transfer.functions.resolve(encodedBalance, encodedState, encodedResolver);
    const ret = res[0];
    return keyify(balance, ret);
  };

  const validateResult = async (
    balance: Balance,
    initialState: HashlockTransferState,
    resolver: HashlockTransferResolver,
    result: Balance,
  ): Promise<void> => {
    const latestBlockTime = (await provider.getBlock("latest")).timestamp;
    if (
      resolver.preImage !== HashZero &&
      (initialState.expiry === "0" || BigNumber.from(initialState.expiry).gt(latestBlockTime))
    ) {
      // Payment completed
      expect(result.to).to.deep.equal(balance.to);
      expect(result.amount[0].toString()).to.eq("0");
      expect(result.amount[1].toString()).to.eq(balance.amount[0]);
    } else {
      // Payment reverted
      expect(result.to).to.deep.equal(balance.to);
      expect(result.amount[0].toString()).to.eq(balance.amount[0]);
      expect(result.amount[1].toString()).to.eq(balance.amount[1]);
    }
  };

  it("should deploy", async () => {
    expect(transfer.address).to.be.a("string");
  });

  it("should return the registry information", async () => {
    const registry = await transfer.getRegistryInformation();
    expect(registry.name).to.be.eq("HashlockTransfer");
    expect(registry.stateEncoding).to.be.eq("tuple(bytes32 lockHash, uint256 expiry)");
    expect(registry.resolverEncoding).to.be.eq("tuple(bytes32 preImage)");
    expect(registry.definition).to.be.eq(transfer.address);
  });

  describe("Create", () => {
    it("should create successfully", async () => {
      const preImage = getRandomBytes32();
      const { state, balance } = await createInitialState(preImage);
      const res = await createTransfer(balance, state);
      expect((res as any)[0]).to.be.true;
    });

    it("should fail create if receiver balance is nonzero", async () => {
      const preImage = getRandomBytes32();
      const { state, balance } = await createInitialState(preImage);
      balance.amount[1] = balance.amount[0];
      await expect(createTransfer(balance, state)).revertedWith("HashlockTransfer: NONZERO_RECIPIENT_BALANCE");
    });

    it("should fail create if lockHash is empty", async () => {
      const preImage = getRandomBytes32();
      const { state, balance } = await createInitialState(preImage);
      state.lockHash = HashZero;
      await expect(createTransfer(balance, state)).revertedWith("HashlockTransfer: EMPTY_LOCKHASH");
    });

    it("should fail create if expiry is nonzero and expired", async () => {
      const preImage = getRandomBytes32();
      const { state, balance } = await createInitialState(preImage);
      state.expiry = Math.floor((Date.now() - 10000) / 1000).toString();
      await expect(createTransfer(balance, state)).revertedWith("HashlockTransfer: EXPIRED_TIMELOCK");
    });

    it("should create successfully if expiry is nonzero and not expired", async () => {
      const preImage = getRandomBytes32();
      const { state, balance } = await createInitialState(preImage);
      state.expiry = (Date.now() + 30).toString();
      const res = await createTransfer(balance, state);
      expect((res as any)[0]).to.be.true;
    });
  });

  describe("Resolve", () => {
    it("should resolve successfully with zero expiry", async () => {
      const preImage = getRandomBytes32();
      const { state, balance } = await createInitialState(preImage);
      const result = await resolveTransfer(balance, state, { preImage });
      await validateResult(balance, state, { preImage }, result);
    });

    it("should resolve successfully with nonzero expiry that is not expired", async () => {
      const preImage = getRandomBytes32();
      const { state, balance } = await createInitialState(preImage);
      state.expiry = (Date.now() + 30).toString();
      const result = await resolveTransfer(balance, state, { preImage });
      await validateResult(balance, state, { preImage }, result);
    });

    it("should refund if preimage is HashZero", async () => {
      const preImage = getRandomBytes32();
      const { state, balance } = await createInitialState(preImage);
      const result = await resolveTransfer(balance, state, { preImage: HashZero });
      await validateResult(balance, state, { preImage: HashZero }, result);
    });

    it("should refund if expiry is nonzero and is expired", async () => {
      const preImage = getRandomBytes32();
      const { state, balance } = await createInitialState(preImage);
      state.expiry = "1";
      const result = await resolveTransfer(balance, state, { preImage: HashZero });
      await validateResult(balance, state, { preImage: HashZero }, result);
    });

    it("should fail if the hash generated does not match preimage", async () => {
      const preImage = getRandomBytes32();
      const { state, balance } = await createInitialState(preImage);
      const incorrectPreImage = getRandomBytes32();
      await expect(resolveTransfer(balance, state, { preImage: incorrectPreImage })).revertedWith(
        "HashlockTransfer: INVALID_PREIMAGE",
      );
    });

    it("should fail if cancelling with a non-zero preimage", async () => {
      const preImage = getRandomBytes32();
      const { state, balance } = await createInitialState(preImage);
      state.expiry = "1";
      await expect(resolveTransfer(balance, state, { preImage: getRandomBytes32() })).revertedWith(
        `HashlockTransfer: NONZERO_LOCKHASH`,
      );
    });
  });
});
