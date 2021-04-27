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

import { EthereumChainService } from "./ethService";

let storeMock: SinonStubbedInstance<IChainServiceStore>;
let signer: SinonStubbedInstance<IChannelSigner>;
let ethService: EthereumChainService;
let provider1337: SinonStubbedInstance<JsonRpcProvider>;
let provider1338: SinonStubbedInstance<JsonRpcProvider>;

let sendTxWithRetriesMock: SinonStub;
let approveMock: SinonStub;
let getCodeMock: SinonStub;
let getOnchainBalanceMock: SinonStub;

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

const { log } = getTestLoggers("ethService");
describe("ethService", () => {
  beforeEach(() => {
    // eth service deps
    storeMock = createStubInstance(MemoryStoreService);

    signer = createStubInstance(ChannelSigner);
    signer.connect.returns(signer as any);
    (signer as any)._isSigner = true;

    const _provider = createStubInstance(JsonRpcProvider);
    _provider.getTransaction.resolves(_txResponse);
    provider1337 = _provider;
    provider1338 = _provider;
    (signer as any).provider = provider1337;

    // create eth service class
    ethService = new EthereumChainService(
      storeMock,
      {
        1337: provider1337,
        1338: provider1338,
      },
      signer,
      log,
    );

    // stubs with default friendly behavior
    getCodeMock = stub(ethService, "getCode").resolves(Result.ok("0x"));
    approveMock = stub(ethService, "approveTokens").resolves(Result.ok(txResponse));
    getOnchainBalanceMock = stub(ethService, "getOnchainBalance").resolves(Result.ok(BigNumber.from("100")));

    // channel state
    const test = createTestChannelState("create");
    channelState = test.channel;
    channelState.networkContext.chainId = 1337;
    signer.getAddress.resolves(channelState.alice);
  });

  afterEach(() => {
    restore();
    reset();
  });

  describe("sendDeployChannelTx", () => {
    beforeEach(() => {
      sendTxWithRetriesMock = stub(ethService, "sendTxWithRetries").resolves(Result.ok(txResponse));
    });

    it("errors if cannot get a signer", async () => {
      channelState.networkContext.chainId = 1234;
      const result = await ethService.sendDeployChannelTx(channelState);
      assertResult(result, true, ChainError.reasons.SignerNotFound);
    });

    it("errors if multisig code cannot be retrieved", async () => {
      getCodeMock.resolves(Result.fail(new ChainError("getCode error")));
      const result = await ethService.sendDeployChannelTx(channelState);
      assertResult(result, true, "getCode error");
    });

    it("errors if multisig is already deployed", async () => {
      getCodeMock.resolves(Result.ok(mkHash("0xabc")));
      const result = await ethService.sendDeployChannelTx(channelState);
      assertResult(result, true, ChainError.reasons.MultisigDeployed);
    });

    it("errors if multisig deployment fails without deposit", async () => {
      sendTxWithRetriesMock.resolves(Result.fail(new ChainError(ChainError.reasons.TxReverted)));
      const result = await ethService.sendDeployChannelTx(channelState);
      assertResult(result, true, ChainError.reasons.TxReverted);
    });

    it("errors if multisig deployment returns nothing", async () => {
      sendTxWithRetriesMock.resolves(Result.ok(undefined));
      const result = await ethService.sendDeployChannelTx(channelState);
      assertResult(result, true, ChainError.reasons.MultisigDeployed);
    });

    it("errors if deposit and is not alice", async () => {
      signer.getAddress.resolves(channelState.bob);
      const result = await ethService.sendDeployChannelTx(channelState, {
        amount: "1",
        assetId: AddressZero,
      });
      assertResult(result, true, ChainError.reasons.FailedToDeploy);
    });

    it("errors if deposit and cannot get onchain balance", async () => {
      getOnchainBalanceMock.resolves(Result.fail(new ChainError(ChainError.reasons.TxNotFound)));
      const result = await ethService.sendDeployChannelTx(channelState, {
        amount: "1",
        assetId: AddressZero,
      });
      assertResult(result, true, ChainError.reasons.TxNotFound);
    });

    it("errors if deposit and not enough onchain balance", async () => {
      getOnchainBalanceMock.resolves(Result.ok(BigNumber.from("9")));
      const result = await ethService.sendDeployChannelTx(channelState, {
        amount: "10",
        assetId: AddressZero,
      });
      assertResult(result, true, ChainError.reasons.NotEnoughFunds);
    });

    it("errors if error on approve", async () => {
      approveMock.resolves(Result.fail(new ChainError(ChainError.reasons.NotEnoughFunds)));
      const result = await ethService.sendDeployChannelTx(channelState, {
        amount: "1",
        assetId: mkAddress("0xa"),
      });
      assertResult(result, true, ChainError.reasons.NotEnoughFunds);
    });

    it("happy: alice can deploy channel without deposit", async () => {
      const result = await ethService.sendDeployChannelTx(channelState);
      assertResult(result, false, txResponse);
      const call = sendTxWithRetriesMock.getCall(0);
      expect(call.args[0]).to.eq(channelState.channelAddress);
      expect(call.args[1]).to.eq(channelState.networkContext.chainId);
      expect(call.args[2]).to.eq(TransactionReason.deploy);
    });

    it("happy: bob can deploy channel without deposit", async () => {
      signer.getAddress.resolves(channelState.bob);
      const result = await ethService.sendDeployChannelTx(channelState);
      assertResult(result, false, txResponse);
      const call = sendTxWithRetriesMock.getCall(0);
      expect(call.args[0]).to.eq(channelState.channelAddress);
      expect(call.args[1]).to.eq(channelState.networkContext.chainId);
      expect(call.args[2]).to.eq(TransactionReason.deploy);
    });

    it("happy: calls createChannelAndDepositAlice with native asset if 0x000... deposit", async () => {
      const result = await ethService.sendDeployChannelTx(channelState, {
        amount: "1",
        assetId: AddressZero,
      });
      assertResult(result, false, txResponse);
      const call = sendTxWithRetriesMock.getCall(0);
      expect(call.args[0]).to.eq(channelState.channelAddress);
      expect(call.args[1]).to.eq(channelState.networkContext.chainId);
      expect(call.args[2]).to.eq(TransactionReason.deployWithDepositAlice);
    });

    it("happy: calls createChannelAndDepositAlice with tokens if token deposit", async () => {
      const result = await ethService.sendDeployChannelTx(channelState, {
        amount: "1",
        assetId: mkAddress("0xa"),
      });
      assertResult(result, false);
      const approveCall = approveMock.getCall(0);
      expect(approveCall.args[0]).to.eq(channelState.channelAddress);
      expect(approveCall.args[1]).to.eq(channelState.networkContext.channelFactoryAddress);
      expect(approveCall.args[2]).to.eq(channelState.alice);
      expect(approveCall.args[3]).to.eq("1");
      expect(approveCall.args[4]).to.eq(mkAddress("0xa"));
      expect(approveCall.args[5]).to.eq(channelState.networkContext.chainId);
      const call = sendTxWithRetriesMock.getCall(0);
      expect(call.args[0]).to.eq(channelState.channelAddress);
      expect(call.args[1]).to.eq(channelState.networkContext.chainId);
      expect(call.args[2]).to.eq("deployWithDepositAlice");
    });
  });

  describe("sendWithdrawTx", () => {
    const minTx: MinimalTransaction = {
      data: mkBytes32("0xabc"),
      to: AddressZero,
      value: 0,
    };
    let sendDeployChannelTxMock: SinonStub;

    beforeEach(() => {
      sendDeployChannelTxMock = stub(ethService, "sendDeployChannelTx").resolves(Result.ok(txResponse));
      sendTxWithRetriesMock = stub(ethService, "sendTxWithRetries").resolves(Result.ok(txResponse));
    });

    it("errors if cannot get a signer", async () => {
      channelState.networkContext.chainId = 1234;
      const result = await ethService.sendWithdrawTx(channelState, minTx);
      assertResult(result, true, ChainError.reasons.SignerNotFound);
    });

    it("errors if multisig code cannot be retrieved", async () => {
      getCodeMock.resolves(Result.fail(new ChainError("getCode error")));
      const result = await ethService.sendWithdrawTx(channelState, minTx);
      assertResult(result, true, "getCode error");
    });

    it("errors if channel deployment fails", async () => {
      sendDeployChannelTxMock.resolves(Result.fail(new ChainError(ChainError.reasons.NotEnoughFunds)));
      const result = await ethService.sendWithdrawTx(channelState, minTx);
      assertResult(result, true, ChainError.reasons.FailedToDeploy);
    });

    it("errors if deploy tx receipt is status = 0", async () => {
      sendDeployChannelTxMock.resolves(Result.ok({ ...txResponse, wait: () => Promise.resolve({ status: 0 }) }));
      const result = await ethService.sendWithdrawTx(channelState, minTx);
      assertResult(result, true, ChainError.reasons.TxReverted);
    });

    it("errors if deploy tx throws an error", async () => {
      sendDeployChannelTxMock.resolves(Result.ok({ ...txResponse, wait: () => Promise.reject("Booo") }));
      const result = await ethService.sendWithdrawTx(channelState, minTx);
      assertResult(result, true, ChainError.reasons.FailedToDeploy);
    });

    it("happy: if channel is deployed, send withdrawal tx", async () => {
      getCodeMock.resolves(Result.ok(mkHash("0xabc")));
      const result = await ethService.sendWithdrawTx(channelState, minTx);
      expect(sendDeployChannelTxMock.callCount).to.eq(0);
      assertResult(result, false, txResponse);
    });

    it("happy: if channel is not deployed, deploy channel then send withdrawal tx", async () => {
      const result = await ethService.sendWithdrawTx(channelState, minTx);
      expect(sendDeployChannelTxMock.callCount).to.eq(1);
      expect(sendDeployChannelTxMock.getCall(0).firstArg).to.deep.eq(channelState);
      assertResult(result, false, txResponse);
    });
  });

  describe("sendDepositTx", () => {
    let sendDeployChannelTxMock: SinonStub;
    let sendDepositATxMock: SinonStub;
    let sendDepositBTxMock: SinonStub;

    beforeEach(() => {
      sendDeployChannelTxMock = stub(ethService, "sendDeployChannelTx").resolves(Result.ok(txResponse));
      sendDepositATxMock = stub(ethService, "sendDepositATx").resolves(Result.ok(txResponse));
      sendDepositBTxMock = stub(ethService, "sendDepositBTx").resolves(Result.ok(txResponse));
      sendTxWithRetriesMock = stub(ethService, "sendTxWithRetries").resolves(Result.ok(txResponse));
    });

    it("errors if cannot get a signer", async () => {
      channelState.networkContext.chainId = 1234;
      const result = await ethService.sendDepositTx(channelState, channelState.alice, "1", AddressZero);
      assertResult(result, true, ChainError.reasons.SignerNotFound);
    });

    it("errors if sender is not in channel", async () => {
      const result = await ethService.sendDepositTx(channelState, mkAddress("0xababab"), "1", AddressZero);
      assertResult(result, true, ChainError.reasons.SenderNotInChannel);
    });

    it("errors if deposit amount is negative", async () => {
      const result = await ethService.sendDepositTx(channelState, channelState.alice, "-1", AddressZero);
      assertResult(result, true, ChainError.reasons.NegativeDepositAmount);
    });

    it("errors if multisig code cannot be retrieved", async () => {
      getCodeMock.resolves(Result.fail(new ChainError("getCode error")));
      const result = await ethService.sendDepositTx(channelState, channelState.alice, "1", AddressZero);
      assertResult(result, true, "getCode error");
    });

    it("errors if onchain balance returns an error", async () => {
      getCodeMock.resolves(Result.ok(mkHash("0xabc")));
      getOnchainBalanceMock.resolves(Result.fail(new Error("getOnchainBalance error")));
      const result = await ethService.sendDepositTx(channelState, channelState.alice, "1", AddressZero);
      assertResult(result, true, "getOnchainBalance error");
    });

    it("errors if channel is deployed and onchain balance is < send amount", async () => {
      getCodeMock.resolves(Result.ok(mkHash("0xabc")));
      getOnchainBalanceMock.resolves(Result.ok(BigNumber.from(5)));
      const result = await ethService.sendDepositTx(channelState, channelState.alice, "6", AddressZero);
      assertResult(result, true, ChainError.reasons.NotEnoughFunds);
    });

    it("happy: alice deploys channel with deposit if not deployed", async () => {
      const result = await ethService.sendDepositTx(channelState, channelState.alice, "1", AddressZero);
      assertResult(result, false, txResponse);
      expect(sendDeployChannelTxMock.callCount).to.eq(1);
      const call = sendDeployChannelTxMock.getCall(0);
      expect(call.args[0]).to.deep.eq(channelState);
      expect(call.args[1]).to.deep.eq({ amount: "1", assetId: AddressZero });
    });

    it("happy: alice calls sendDepositATx if multisig is deployed", async () => {
      getCodeMock.resolves(Result.ok(mkHash("0xabc")));
      const result = await ethService.sendDepositTx(channelState, channelState.alice, "1", AddressZero);
      assertResult(result, false, txResponse);
      expect(sendDepositATxMock.callCount).to.eq(1);
      const call = sendDepositATxMock.getCall(0);
      expect(call.args[0]).to.deep.eq(channelState);
      expect(call.args[1]).to.deep.eq("1");
      expect(call.args[2]).to.deep.eq(AddressZero);
    });

    it("happy: bob calls sendDepositBTx if multisig is deployed", async () => {
      getCodeMock.resolves(Result.ok(mkHash("0xabc")));
      const result = await ethService.sendDepositTx(channelState, channelState.bob, "1", AddressZero);
      assertResult(result, false, txResponse);
      expect(sendDepositBTxMock.callCount).to.eq(1);
      const call = sendDepositBTxMock.getCall(0);
      expect(call.args[0]).to.deep.eq(channelState);
      expect(call.args[1]).to.deep.eq("1");
      expect(call.args[2]).to.deep.eq(AddressZero);
    });

    it("happy: bob calls sendDepositBTx if multisig is not deployed", async () => {
      const result = await ethService.sendDepositTx(channelState, channelState.bob, "1", AddressZero);
      assertResult(result, false, txResponse);
      expect(sendDepositBTxMock.callCount).to.eq(1);
      const call = sendDepositBTxMock.getCall(0);
      expect(call.args[0]).to.deep.eq(channelState);
      expect(call.args[1]).to.deep.eq("1");
      expect(call.args[2]).to.deep.eq(AddressZero);
    });
  });

  describe("speedUpTx", () => {
    const minTx: MinimalTransaction & { transactionHash: string; nonce: number } = {
      data: mkBytes32("0xabc"),
      to: mkAddress("0xbca"),
      value: 0,
      transactionHash: mkBytes32("0xfff"),
      nonce: 8,
    };

    beforeEach(() => {
      sendTxWithRetriesMock = stub(ethService, "sendTxWithRetries").resolves(Result.ok(txResponse));
    });

    it("errors if cannot get a signer", async () => {
      const result = await ethService.speedUpTx(1234, minTx);
      assertResult(result, true, ChainError.reasons.SignerNotFound);
    });

    it("errors if cannot get transaction", async () => {
      provider1337.getTransaction.rejects("Boooo");
      const result = await ethService.speedUpTx(1337, minTx);
      assertResult(result, true, ChainError.reasons.TxNotFound);
    });

    it("errors if transaction is confirmed", async () => {
      provider1337.getTransaction.resolves({ confirmations: 1 } as any);
      const result = await ethService.speedUpTx(1337, minTx);
      assertResult(result, true, ChainError.reasons.TxAlreadyMined);
    });

    it("happy: speeds up tx", async () => {
      provider1337.getTransaction.resolves({ confirmations: 0 } as any);
      const result = await ethService.speedUpTx(1337, minTx);
      assertResult(result, false, txResponse);
      expect(sendTxWithRetriesMock.callCount).to.eq(1);
      const call = sendTxWithRetriesMock.getCall(0);
      expect(call.args[0]).to.eq(minTx.to);
      expect(call.args[1]).to.eq(1337);
      expect(call.args[2]).to.eq(TransactionReason.speedUpTransaction);
    });
  });

  describe("sendTxWithRetries", () => {
    let sendTxAndParseResponseMock: SinonStub;

    beforeEach(() => {
      sendTxAndParseResponseMock = stub(ethService, "sendTxAndParseResponse").resolves(Result.ok(txResponse));
    });

    it("errors if sendTxAndParseResponse errors", async () => {
      sendTxAndParseResponseMock.resolves(Result.fail(new ChainError(ChainError.reasons.NotEnoughFunds)));
      const result = await ethService.sendTxWithRetries(
        channelState.channelAddress,
        channelState.networkContext.chainId,
        "allowance",
        () => {
          return Promise.resolve(_txResponse);
        },
      );
      assertResult(result, true, ChainError.reasons.NotEnoughFunds);
    });

    it("retries if it's a retryable error", async () => {
      sendTxAndParseResponseMock
        .onFirstCall()
        .resolves(
          Result.fail(
            new ChainError(
              'processing response error (body="{"jsonrpc":"2.0","error":{"code":-32000,"message":"Block information is incomplete while ancient block sync is still in progress, before it\'s finished we can\'t determine the existence of requested item."},"id":14890}\n", error={"code":-32000}, requestBody="{"method":"eth_getTransactionReceipt","params":["0x8731c46fafd569bb65c6c26cd3960ad418d88310a41a03c5c4f4a0dcce15cd8a"],"id":14890,"jsonrpc":"2.0"}", requestMethod="POST", url="https://rpc.xdaichain.com/", code=SERVER_ERROR, version=web/5.1.0)',
            ),
          ),
        );

      sendTxAndParseResponseMock.resolves(Result.ok(txResponse));
      const result = await ethService.sendTxWithRetries(
        channelState.channelAddress,
        channelState.networkContext.chainId,
        "allowance",
        () => {
          return Promise.resolve(_txResponse);
        },
      );
      assertResult(result, false, txResponse);
    });

    it("happy: should work when sendTxAndParseResponse works on the first try", async () => {
      const result = await ethService.sendTxWithRetries(
        channelState.channelAddress,
        channelState.networkContext.chainId,
        "allowance",
        () => {
          return Promise.resolve(_txResponse);
        },
      );
      assertResult(result, false, txResponse);
    });
  });

  describe("sendTxAndParseResponse", () => {
    it("if txFn returns undefined, returns undefined", async () => {
      const result = await ethService.sendTxAndParseResponse(AddressZero, 111, "allowance", async () => {
        return undefined;
      });
      assertResult(result, false, undefined);
    });

    it("if txFn errors, returns error", async () => {
      const result = await ethService.sendTxAndParseResponse(AddressZero, 111, "allowance", async () => {
        throw new Error("Boooo");
      });
      assertResult(result, true, "Boooo");
    });

    it("if txFn errors, with not enough funds, return special error", async () => {
      const result = await ethService.sendTxAndParseResponse(AddressZero, 111, "allowance", async () => {
        throw new Error("sender doesn't have enough funds");
      });
      assertResult(result, true, ChainError.reasons.NotEnoughFunds);
    });

    it("if receipt status = 0, saves response with error", async () => {
      const t = {
        ..._txResponse,
        wait: async () => {
          return { status: 0 };
        },
      } as any;
      const result = await ethService.sendTxAndParseResponse(AddressZero, 111, "allowance", async () => {
        return t;
      });
      expect(storeMock.saveTransactionResponse.callCount).eq(1);
      const saveTransactionResponseCall = storeMock.saveTransactionResponse.getCall(0);
      expect(saveTransactionResponseCall.args[0]).eq(AddressZero);
      expect(saveTransactionResponseCall.args[1]).eq("allowance");
      expect(saveTransactionResponseCall.args[2]).deep.eq(t);

      expect(storeMock.saveTransactionFailure.callCount).eq(1);
      const saveTransactionFailureCall = storeMock.saveTransactionFailure.getCall(0);
      expect(saveTransactionFailureCall.args[0]).eq(AddressZero);
      expect(saveTransactionFailureCall.args[1]).eq(t.hash);
      expect(saveTransactionFailureCall.args[2]).eq("Tx reverted");
      assertResult(result, false);
    });

    it("if receipt wait fn errors, saves response with error", async () => {
      const t = {
        ..._txResponse,
        wait: async () => {
          throw new Error("Booooo");
        },
      } as any;
      const result = await ethService.sendTxAndParseResponse(AddressZero, 111, "allowance", async () => {
        return t;
      });
      expect(storeMock.saveTransactionResponse.callCount).eq(1);
      const saveTransactionResponseCall = storeMock.saveTransactionResponse.getCall(0);
      expect(saveTransactionResponseCall.args[0]).eq(AddressZero);
      expect(saveTransactionResponseCall.args[1]).eq("allowance");
      expect(saveTransactionResponseCall.args[2]).deep.eq(t);
      assertResult(result, false);

      expect(storeMock.saveTransactionFailure.callCount).eq(1);
      const saveTransactionFailureCall = storeMock.saveTransactionFailure.getCall(0);
      expect(saveTransactionFailureCall.args[0]).eq(AddressZero);
      expect(saveTransactionFailureCall.args[1]).eq(t.hash);
      expect(saveTransactionFailureCall.args[2]).eq("Booooo");
      assertResult(result, false);
    });

    it("happy: saves responses", async () => {
      const result = await ethService.sendTxAndParseResponse(AddressZero, 111, "allowance", async () => {
        return _txResponse;
      });
      expect(storeMock.saveTransactionResponse.callCount).eq(1);
      const saveTransactionResponseCall = storeMock.saveTransactionResponse.getCall(0);
      expect(saveTransactionResponseCall.args[0]).eq(AddressZero);
      expect(saveTransactionResponseCall.args[1]).eq("allowance");
      expect(saveTransactionResponseCall.args[2]).deep.eq(_txResponse);
      assertResult(result, false);

      expect(storeMock.saveTransactionReceipt.callCount).eq(1);
      const saveTransactionReceiptCall = storeMock.saveTransactionReceipt.getCall(0);
      expect(saveTransactionReceiptCall.args[0]).eq(AddressZero);

      assertResult(result, false);
    });
  });

  describe("revitalizeTxs", () => {
    it("should start monitoring active txs", async () => {});
  });
});
