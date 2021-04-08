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

const txResponse: TransactionResponseWithResult = {
  chainId: 1337,
  completed: () => Promise.resolve(Result.ok({} as any)),
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

const { log } = getTestLoggers("ethService");
describe.only("ethService", () => {
  beforeEach(() => {
    // eth service deps
    storeMock = createStubInstance(MemoryStoreService);
    signer = createStubInstance(ChannelSigner);
    provider1337 = createStubInstance(JsonRpcProvider);
    provider1338 = createStubInstance(JsonRpcProvider);
    signer.connect.returns(signer as any);
    (signer as any)._isSigner = true;

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

    // stubs
    getCodeMock = stub(ethService, "getCode").resolves(Result.ok("0x"));
    sendTxWithRetriesMock = stub(ethService, "sendTxWithRetries");
    sendTxWithRetriesMock.resolves(Result.ok(txResponse));
    approveMock = stub(ethService, "approveTokens");
    approveMock.resolves(Result.ok(txResponse));
    getOnchainBalanceMock = stub(ethService, "getOnchainBalance").resolves(Result.ok(BigNumber.from("100")));
  });

  afterEach(() => {
    restore();
    reset();
  });

  describe.only("sendDeployChannelTx", () => {
    let channelState: FullChannelState;

    beforeEach(() => {
      const test = createTestChannelState("create");
      channelState = test.channel;
      channelState.networkContext.chainId = 1337;
      signer.getAddress.resolves(channelState.alice);
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
    let channelState: FullChannelState;
    const minTx: MinimalTransaction = {
      data: mkBytes32("0xabc"),
      to: AddressZero,
      value: 0,
    };
    let sendDeployChannelTxMock: SinonStub;

    beforeEach(() => {
      const test = createTestChannelState("create");
      channelState = test.channel;
      channelState.networkContext.chainId = 1337;
      signer.getAddress.resolves(channelState.alice);
      sendDeployChannelTxMock = stub(ethService, "sendDeployChannelTx");
      sendDeployChannelTxMock.resolves(Result.ok(txResponse));
      ethService;
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
});
