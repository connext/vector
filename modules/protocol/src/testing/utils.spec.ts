import { BigNumber, Contract, constants, ContractFactory } from "ethers";
import { ChannelMastercopy, TestToken } from "@connext/vector-contracts";
import { JsonRpcProvider, Balance, CoreChannelState, IChannelSigner } from "@connext/vector-types";
import { createTestChannelState, getRandomChannelSigner } from "@connext/vector-utils";
import { expect } from "chai";

import { reconcileDeposit } from "../utils";

import { env } from "./utils";
import { MockOnchainServce } from "./services/onchain";

describe("utils", () => {
  describe("reconcileDeposit", () => {
    const chainId = parseInt(Object.keys(env.chainProviders)[0]);
    const providerUrl = env.chainProviders[chainId];
    const provider = new JsonRpcProvider(providerUrl);
    const wallet = env.sugarDaddy.connect(provider);
    let state: CoreChannelState;
    let channelContract: Contract;
    let token: Contract;
    let signer: IChannelSigner;

    async function depositA(amount: string, assetId: string): Promise<void> {
      if (assetId === constants.AddressZero) {
        await channelContract.functions.depositA(assetId, BigNumber.from(amount), { value: BigNumber.from(amount) });
      } else {
        await token.approve(channelContract.address, BigNumber.from(amount));
        await channelContract.functions.depositA(assetId, BigNumber.from(amount));
      }
    }

    async function depositB(amount: string, assetId: string): Promise<void> {
      if (assetId === constants.AddressZero) {
        await wallet.sendTransaction({ to: state.channelAddress, value: BigNumber.from(amount) });
      } else {
        await token.transfer(channelContract.address, BigNumber.from(amount));
      }
    }

    async function validateRet(
      ret: { balance: Balance; latestDepositNonce: number },
      assetId: string,
      amount: string[],
      initialBalance: Balance,
    ): Promise<void> {
      let onchainDepositA: { nonce: BigNumber; amount: BigNumber };
      try {
        onchainDepositA = await channelContract.latestDepositByAssetId(assetId);
      } catch (e) {
        // Channel contract was not deployed, use 0 value
        onchainDepositA = { amount: BigNumber.from(0), nonce: BigNumber.from(0) };
      }
      const expectedBalance = {
        ...initialBalance,
        amount: [
          BigNumber.from(initialBalance.amount[0]).add(amount[0]).toString(),
          BigNumber.from(initialBalance.amount[1]).add(amount[1]).toString(),
        ],
      };
      expect(expectedBalance).deep.eq(ret.balance);
      expect(onchainDepositA.nonce.toNumber()).to.eq(ret.latestDepositNonce);
    }

    beforeEach(async () => {
      // TODO replace this with a mock
      channelContract = await new ContractFactory(ChannelMastercopy.abi, ChannelMastercopy.bytecode, wallet).deploy();
      await channelContract.deployed();
      token = new Contract(env.chainAddresses[chainId].TestToken.address, TestToken.abi, wallet);
      state = createTestChannelState("setup", {
        assetIds: [constants.AddressZero, token.address],
        latestDepositNonce: 0,
        channelAddress: channelContract.address,
      });

      // Test channel state starts with some eth and tokens, deposit them now
      await wallet.sendTransaction({
        to: channelContract.address,
        value: BigNumber.from(state.balances[0].amount[0]).add(state.balances[0].amount[1]).add(state.lockedBalance[0]),
      });
      await token.transfer(
        channelContract.address,
        BigNumber.from(state.balances[1].amount[0]).add(state.balances[1].amount[1]).add(state.lockedBalance[1]),
      );
      signer = getRandomChannelSigner(provider);
    });

    it("should work for Alice Eth deposit", async () => {
      const assetId = constants.AddressZero;
      const amount = ["7", "0"];

      await depositA(amount[0], assetId);
      const ret = await reconcileDeposit(
        state.channelAddress,
        chainId,
        state.balances[0],
        state.latestDepositNonce,
        state.lockedBalance[0],
        assetId,
        new MockOnchainServce(),
      );

      await validateRet(ret.getValue(), assetId, amount, state.balances[0]);
    });

    it("should work for Alice Token deposit", async () => {
      const assetId = token.address;
      const amount = ["7", "0"];

      await depositA(amount[0], assetId);
      const ret = await reconcileDeposit(
        state.channelAddress,
        chainId,
        state.balances[1],
        state.latestDepositNonce,
        state.lockedBalance[1],
        assetId,
        new MockOnchainServce(),
      );

      await validateRet(ret.getValue(), assetId, amount, state.balances[1]);
    });

    it("should work for Bob Eth deposit", async () => {
      const assetId = constants.AddressZero;
      const amount = ["0", "7"];

      await depositB(amount[1], assetId);
      const ret = await reconcileDeposit(
        state.channelAddress,
        chainId,
        state.balances[0],
        state.latestDepositNonce,
        state.lockedBalance[0],
        assetId,
        new MockOnchainServce(),
      );
      await validateRet(ret.getValue(), assetId, amount, state.balances[0]);
    });

    it("should work for Bob Token deposit", async () => {
      const assetId = token.address;
      const amount = ["0", "7"];

      await depositB(amount[1], assetId);
      const ret = await reconcileDeposit(
        state.channelAddress,
        chainId,
        state.balances[1],
        state.latestDepositNonce,
        state.lockedBalance[1],
        assetId,
        new MockOnchainServce(),
      );

      await validateRet(ret.getValue(), assetId, amount, state.balances[1]);
    });

    it("should work for both Eth deposit", async () => {
      const assetId = constants.AddressZero;
      const amount = ["7", "5"];

      await depositA(amount[0], assetId);
      await depositB(amount[1], assetId);
      const ret = await reconcileDeposit(
        state.channelAddress,
        chainId,
        state.balances[0],
        state.latestDepositNonce,
        state.lockedBalance[0],
        assetId,
        new MockOnchainServce(),
      );

      await validateRet(ret.getValue(), assetId, amount, state.balances[0]);
    });

    it("should work for both token deposit", async () => {
      const assetId = token.address;
      const amount = ["7", "5"];

      await depositA(amount[0], assetId);
      await depositB(amount[1], assetId);
      const ret = await reconcileDeposit(
        state.channelAddress,
        chainId,
        state.balances[1],
        state.latestDepositNonce,
        state.lockedBalance[1],
        assetId,
        new MockOnchainServce(),
      );

      await validateRet(ret.getValue(), assetId, amount, state.balances[1]);
    });
  });
});
