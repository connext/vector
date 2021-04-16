import {
  ChainError,
  FullChannelState,
  IChainServiceStore,
  IChannelSigner,
  MinimalTransaction,
  Result,
  TransactionReason,
  TransactionResponseWithResult,
} from "@connext/vector-types";
import {
  ChannelSigner,
  createTestChannelState,
  expect,
  getTestLoggers,
  MemoryStoreService,
  mkAddress,
  mkBytes32,
  mkHash,
} from "@connext/vector-utils";
import { AddressZero, One, Zero } from "@ethersproject/constants";
import { JsonRpcProvider, TransactionReceipt } from "@ethersproject/providers";
import { BigNumber } from "ethers";
import { restore, reset, createStubInstance, SinonStubbedInstance, stub, SinonStub } from "sinon";

import { EthereumChainReader } from "./ethReader";

// let storeMock: SinonStubbedInstance<IChainServiceStore>;
// let signer: SinonStubbedInstance<IChannelSigner>;
let ethReader: EthereumChainReader;
let provider1337: SinonStubbedInstance<JsonRpcProvider>;
let provider1338: SinonStubbedInstance<JsonRpcProvider>;

// let sendTxWithRetriesMock: SinonStub;
// let approveMock: SinonStub;
// let getCodeMock: SinonStub;
// let getOnchainBalanceMock: SinonStub;

let channelState: FullChannelState;

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

const txResponse: TransactionResponseWithResult = {
  ..._txResponse,
  completed: () => Promise.resolve(Result.ok({} as any)),
};

const { log } = getTestLoggers("ethReader");
describe.only("ethReader", () => {
  const chain1337: number = 1337;
  const chain1338: number = 1338;
  beforeEach(() => {
    // eth service deps

    const _provider = createStubInstance(JsonRpcProvider);
    _provider.getTransaction.resolves(_txResponse);
    provider1337 = _provider;
    provider1338 = _provider;

    // signer = createStubInstance(ChannelSigner);
    // signer.connect.returns(signer as any);
    // (signer as any)._isSigner = true;

    // (signer as any).provider = provider1337;

    // create eth service class
    ethReader = new EthereumChainReader(
      {
        [chain1337]: provider1337,
        [chain1338]: provider1338,
      },
      log,
    );

    // stubs with default friendly behavior
    // getCodeMock = stub(ethService, "getCode").resolves(Result.ok("0x"));
    // approveMock = stub(ethService, "approveTokens").resolves(Result.ok(txResponse));
    // getOnchainBalanceMock = stub(ethService, "getOnchainBalance").resolves(Result.ok(BigNumber.from("100")));

    // channel state
    const test = createTestChannelState("create");
    channelState = test.channel;
    channelState.networkContext.chainId = 1337;
    // signer.getAddress.resolves(channelState.alice);
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
  describe("getGasPrice", () => {});
  describe("estimateGas", () => {});
  describe("getTokenAllowance", () => {});
  describe("getOnchainBalance", () => {});
  describe("getDecimals", () => {});
  describe("getWithdrawalTransactionRecord", () => {});
  describe("registerChannel", () => {});
});
