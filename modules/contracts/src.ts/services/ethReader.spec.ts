import { ChainError, FullChannelState, Result } from "@connext/vector-types";
import { createTestChannelState, expect, getTestLoggers, mkHash } from "@connext/vector-utils";
import { JsonRpcProvider, TransactionReceipt } from "@ethersproject/providers";
import { AddressZero, One, Zero } from "@ethersproject/constants";
import { parseUnits } from "@ethersproject/units";
import { restore, reset, createStubInstance, SinonStubbedInstance } from "sinon";

import { EthereumChainReader, MIN_GAS_PRICE, BUMP_GAS_PRICE } from "./ethReader";

let ethReader: EthereumChainReader;
let channelState: FullChannelState;
let provider1337: SinonStubbedInstance<JsonRpcProvider>;
let provider1338: SinonStubbedInstance<JsonRpcProvider>;

const assertResult = (result: Result<any>, isError: boolean, unwrappedVal?: any) => {
  if (isError) {
    expect(result.isError).to.be.true;
    if (unwrappedVal) {
      expect(result.getError()?.message).to.be.eq(unwrappedVal);
    }
  } else {
    expect(result.isError).to.be.false;
    if (unwrappedVal) {
      expect(result.getValue()).to.deep.eq(unwrappedVal);
    }
  }
};

const _txResponse = {
  chainId: 1337,
  confirmations: 1,
  data: "0x",
  from: AddressZero,
  gasLimit: One,
  gasPrice: One,
  hash: mkHash(),
  nonce: 1,
  value: Zero,
  wait: () => Promise.resolve({} as TransactionReceipt),
};

const { log } = getTestLoggers("ethReader");
describe("ethReader", () => {
  const chain1337: number = 1337;
  const chain1338: number = 1338;
  beforeEach(() => {
    // eth service deps

    const _provider = createStubInstance(JsonRpcProvider);
    _provider.getTransaction.resolves(_txResponse);
    _provider.getBlockNumber.resolves(10);
    provider1337 = _provider;
    provider1338 = _provider;

    ethReader = new EthereumChainReader(
      {
        [chain1337]: provider1337,
        [chain1338]: provider1338,
      },
      log,
    );

    // channel state
    const test = createTestChannelState("create");
    channelState = test.channel;
    channelState.networkContext.chainId = 1337;
  });

  afterEach(() => {
    restore();
    reset();
  });

  describe.skip("getChainProviders", () => {
    it("happy: getChainProvider", async () => {
      const result = await ethReader.getChainProviders();
      console.log(result);
    });
  });

  describe("getHydratedProviders", () => {
    it("happy: getHydratedProviders", async () => {
      const res = await ethReader.getHydratedProviders();

      expect(res.isError).to.be.false;
      expect(res.getValue()[chain1337]).to.be.eq(provider1337);
      expect(res.getValue()[chain1338]).to.be.eq(provider1338);
    });
  });

  describe("getSyncing", () => {
    it("errors if cannot get a provider", async () => {
      const chainId: number = 1234;
      const res = await ethReader.getSyncing(chainId);

      assertResult(res, true, ChainError.reasons.ProviderNotFound);
    });

    it("error if rpc call eth_syncing errors", async () => {
      provider1337.send.rejects(new Error("fail"));
      const res = await ethReader.getSyncing(chain1337);

      assertResult(res, true, "Could not execute rpc method");

      expect(res.getError()!.msg).to.be.eq("Could not execute rpc method");
      expect(res.getError()!.context.chainId).to.be.eq(chain1337);
      expect(res.getError()!.context.errors[0]).to.be.eq("fail");
      expect(res.getError()!.context.errors[4]).to.be.eq("fail");
    });

    it("happy: getSyncing", async () => {
      const res = await ethReader.getSyncing(chain1337);

      assertResult(res, false);
    });

    it("happy: getSyncing works after one retry", async () => {
      provider1337.send.onFirstCall().rejects(new Error("fail"));
      const res = await ethReader.getSyncing(chain1337);

      assertResult(res, false);
    });

    it("happy: getSyncing works after two retry", async () => {
      provider1337.send.onFirstCall().rejects(new Error("fail"));
      provider1337.send.onSecondCall().rejects(new Error("fail"));
      const res = await ethReader.getSyncing(chain1337);

      assertResult(res, false);
    });
  });

  describe("getCode", () => {
    it("errors if cannot get a provider", async () => {
      const chainId: number = 1234;
      const res = await ethReader.getCode(channelState.channelAddress, chainId);

      assertResult(res, true, ChainError.reasons.ProviderNotFound);
    });

    it("errors if provider getCode errors", async () => {
      provider1337.getCode.rejects(new Error("fail"));
      const res = await ethReader.getCode(channelState.channelAddress, chain1337);

      assertResult(res, true, "Could not execute rpc method");

      expect(res.getError()!.msg).to.be.eq("Could not execute rpc method");
      expect(res.getError()!.context.chainId).to.be.eq(chain1337);
      expect(res.getError()!.context.errors[0]).to.be.eq("fail");
      expect(res.getError()!.context.errors[4]).to.be.eq("fail");
    });

    it("happy: getCode", async () => {
      const res = await ethReader.getCode(channelState.channelAddress, chain1337);
      assertResult(res, false);
    });

    it("happy: getCode works after one retry", async () => {
      provider1337.getCode.onFirstCall().rejects(new Error("fail"));
      const res = await ethReader.getCode(channelState.channelAddress, chain1337);

      assertResult(res, false);
    });

    it("happy: getCode works after second retry", async () => {
      provider1337.getCode.onFirstCall().rejects(new Error("fail"));
      provider1337.getCode.onSecondCall().rejects(new Error("fail"));
      const res = await ethReader.getCode(channelState.channelAddress, chain1337);

      assertResult(res, false);
    });
  });

  describe("getChannelDispute", () => {
    it("errors if cannot get a provider", async () => {
      const chainId: number = 1234;
      const res = await ethReader.getChannelDispute(channelState.channelAddress, chainId);

      assertResult(res, true, ChainError.reasons.ProviderNotFound);
    });

    it("errors if getCode errors", async () => {
      provider1337.getCode.rejects(new Error("fail"));
      const res = await ethReader.getChannelDispute(channelState.channelAddress, chain1337);

      assertResult(res, true, "Could not execute rpc method");

      expect(res.getError()!.msg).to.be.eq("Could not execute rpc method");
      expect(res.getError()!.context.chainId).to.be.eq(chain1337);
      expect(res.getError()!.context.errors[0]).to.be.eq("fail");
      expect(res.getError()!.context.errors[4]).to.be.eq("fail");
    });

    it("get undefined if channel is not deployed", async () => {
      provider1337.getCode.resolves("0x");
      const res = await ethReader.getChannelDispute(channelState.channelAddress, chain1337);

      assertResult(res, false);
      expect(res.getValue()).to.be.undefined;
    });

    it("error: getChannelDispute", async () => {
      provider1337.getCode.resolves("0xA");
      const res = await ethReader.getChannelDispute(channelState.channelAddress, chain1337);

      assertResult(res, true, "Could not execute rpc method");
      expect(res.getError()!.context.chainId).to.be.eq(chain1337);
    });
  });

  describe("getRegisteredTransferByDefinition", () => {});
  describe("getRegisteredTransferByName", () => {});
  describe("getRegisteredTransfers", () => {});
  describe("getChannelFactoryBytecode", () => {});
  describe("getChannelMastercopyAddress", () => {});
  describe("getTotalDepositedA", () => {});
  describe("getTotalDepositedB", () => {});
  describe("create", () => {});
  describe("resolve", () => {});
  describe("getChannelAddress", () => {});
  describe("getBlockNumber", () => {});
  describe("getGasPrice", () => {
    it("errors if cannot get a provider", async () => {
      const chainId: number = 1234;
      const res = await ethReader.getGasPrice(chainId);

      assertResult(res, true, ChainError.reasons.ProviderNotFound);
    });

    it("errors if provider.getGasPrice errors", async () => {
      const errorMessage = "provider.getGasPrice errors";
      provider1337.getGasPrice.rejects(new Error(errorMessage));
      const res = await ethReader.getGasPrice(chain1337);

      assertResult(res, true);
      expect(res.getError()!.msg).to.be.eq("Could not execute rpc method");
      expect(res.getError()!.context.chainId).to.be.eq(chain1337);
      expect(res.getError()!.context.errors[0]).to.be.eq(errorMessage);
      expect(res.getError()!.context.errors[4]).to.be.eq(errorMessage);
    });

    it("happy: getGasPrice, gasPrice < minGasPrice", async () => {
      const _gasPrice = parseUnits("1", "gwei");
      provider1337.getGasPrice.resolves(_gasPrice);
      const res = await ethReader.getGasPrice(chain1337);

      console.log(res.getValue().toString());
      assertResult(res, false);
      expect(res.getValue()).to.be.eq(MIN_GAS_PRICE);
    });

    it("happy: getGasPrice, gasPrice > minGasPrice", async () => {
      const _gasPrice = parseUnits("6", "gwei");
      provider1337.getGasPrice.resolves(_gasPrice);
      const res = await ethReader.getGasPrice(chain1337);

      console.log(res.getValue().toString());
      assertResult(res, false);
      expect(res.getValue()).to.be.gt(MIN_GAS_PRICE);
      expect(res.getValue()).to.be.eq(_gasPrice.add(_gasPrice.mul(BUMP_GAS_PRICE).div(100)));
    });
  });
  describe("estimateGas", () => {});
  describe("getTokenAllowance", () => {});
  describe("getOnchainBalance", () => {});
  describe("getDecimals", () => {});
  describe("getWithdrawalTransactionRecord", () => {});
  describe("registerChannel", () => {});
});
