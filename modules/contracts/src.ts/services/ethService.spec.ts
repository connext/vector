import {
  ChainError,
  FullChannelState,
  IChainServiceStore,
  IChannelSigner,
  MinimalTransaction,
  Result,
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
let ethService: SinonStubbedInstance<EthereumChainService>;
let provider1337: SinonStubbedInstance<JsonRpcProvider>;
let provider1338: SinonStubbedInstance<JsonRpcProvider>;
let sendTxWithRetriesMock: SinonStub;
let approveMock: SinonStub;

const assertResult = (result: Result<any>, isError: boolean, unwrappedVal?: string) => {
  if (isError) {
    expect(result.isError).to.be.true;
    if (unwrappedVal) {
      expect(result.getError()?.message).to.be.eq(unwrappedVal);
    }
  } else {
    expect(result.isError).to.be.false;
    if (unwrappedVal) {
      expect(result.getValue()).to.be.eq(unwrappedVal);
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
describe("ethService", () => {
  beforeEach(() => {
    storeMock = createStubInstance(MemoryStoreService);
    signer = createStubInstance(ChannelSigner);
    provider1337 = createStubInstance(JsonRpcProvider);
    provider1338 = createStubInstance(JsonRpcProvider);
    signer.connect.returns(signer as any);
    (signer as any)._isSigner = true;
    ethService = createStubInstance(EthereumChainService);
    (ethService as any).signers;
    let _ethService = new EthereumChainService(
      storeMock,
      {
        1337: provider1337,
        1338: provider1338,
      },
      signer,
      log,
    );
    stub(ethService, "getCode").resolves(Result.ok("0x"));
    sendTxWithRetriesMock = stub(ethService, "sendTxWithRetries");
    approveMock = stub(ethService, "approveTokens");
    approveMock.resolves(Result.ok(txResponse));
    sendTxWithRetriesMock.resolves(Result.ok(txResponse));
    stub(ethService, "getOnchainBalance").resolves(Result.ok(BigNumber.from("100")));
  });

  afterEach(() => {
    restore();
    reset();
  });

  describe("sendDeployChannelTx", () => {
    let channelState: FullChannelState;

    beforeEach(() => {
      const test = createTestChannelState("create");
      channelState = test.channel;
      channelState.networkContext.chainId = 1337;
      signer.getAddress.resolves(channelState.alice);
    });

    it("errors if cannot get a signer", async () => {
      channelState.networkContext.chainId = 1234;
      const result = await ethService.sendDeployChannelTx(channelState, One);
      assertResult(result, true, ChainError.reasons.SignerNotFound);
    });

    it("errors if multisig code cannot be retrieved", async () => {
      stub(ethService, "getCode").resolves(Result.fail(new ChainError("getCode error")));
      const result = await ethService.sendDeployChannelTx(channelState, One);
      assertResult(result, true, "getCode error");
    });

    it("errors if multisig is already deployed", async () => {
      stub(ethService, "getCode").resolves(Result.ok(mkHash("0xabc")));
      const result = await ethService.sendDeployChannelTx(channelState, One);
      assertResult(result, true, ChainError.reasons.MultisigDeployed);
    });

    it("errors if multisig deployment fails without deposit", async () => {
      stub(ethService, "sendTxWithRetries").resolves(Result.fail(new ChainError(ChainError.reasons.TxReverted)));
      const result = await ethService.sendDeployChannelTx(channelState, One);
      assertResult(result, true, ChainError.reasons.TxReverted);
    });

    it("errors if multisig deployment returns nothing", async () => {
      stub(ethService, "sendTxWithRetries").resolves(Result.ok(undefined));
      const result = await ethService.sendDeployChannelTx(channelState, One);
      assertResult(result, true, ChainError.reasons.MultisigDeployed);
    });

    it("errors if deposit and is not alice", async () => {
      signer.getAddress.resolves(channelState.bob);
      const result = await ethService.sendDeployChannelTx(channelState, One, {
        amount: "1",
        assetId: AddressZero,
      });
      assertResult(result, true, ChainError.reasons.FailedToDeploy);
    });

    it("errors if deposit and cannot get onchain balance", async () => {
      stub(ethService, "getOnchainBalance").resolves(Result.fail(new ChainError(ChainError.reasons.TxNotFound)));
      const result = await ethService.sendDeployChannelTx(channelState, One, {
        amount: "1",
        assetId: AddressZero,
      });
      assertResult(result, true, ChainError.reasons.TxNotFound);
    });

    it("errors if deposit and not enough onchain balance", async () => {
      stub(ethService, "getOnchainBalance").resolves(Result.ok(BigNumber.from("9")));
      const result = await ethService.sendDeployChannelTx(channelState, One, {
        amount: "10",
        assetId: AddressZero,
      });
      assertResult(result, true, ChainError.reasons.NotEnoughFunds);
    });

    it("sendDepositATx with tokens if eth deposit + multisig deployed, error on approve", async () => {
      approveMock.resolves(Result.fail(new ChainError(ChainError.reasons.NotEnoughFunds)));
      const result = await ethService.sendDeployChannelTx(channelState, One, {
        amount: "1",
        assetId: mkAddress("0xa"),
      });
      assertResult(result, true, ChainError.reasons.NotEnoughFunds);
    });

    it("happy: calls sendDepositATx with native asset if eth deposit + multisig deployed", async () => {
      const result = await ethService.sendDeployChannelTx(channelState, One, {
        amount: "1",
        assetId: AddressZero,
      });
      assertResult(result, false);
      const call = sendTxWithRetriesMock.getCall(0);
      expect(call.args[0]).to.eq(channelState.channelAddress);
      expect(call.args[1]).to.eq(channelState.networkContext.chainId);
      expect(call.args[2]).to.eq("deployWithDepositAlice");
    });

    it("happy: calls sendDepositATx with tokens if eth deposit + multisig deployed", async () => {
      const result = await ethService.sendDeployChannelTx(channelState, One, {
        amount: "1",
        assetId: mkAddress("0xa"),
      });
      assertResult(result, false);
      const approveCall = approveMock.getCall(0);
      expect(approveCall.args[0]).to.eq(channelState.channelAddress);
      expect(approveCall.args[1]).to.eq(channelState.networkContext.chainId);
      expect(approveCall.args[2]).to.eq("deployWithDepositAlice");
      const call = sendTxWithRetriesMock.getCall(0);
      expect(call.args[0]).to.eq(channelState.channelAddress);
      expect(call.args[1]).to.eq(channelState.networkContext.chainId);
      expect(call.args[2]).to.eq("deployWithDepositAlice");
    });
  });

  describe.skip("sendWithdrawTx", () => {
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
      sendDeployChannelTxMock.resolves();
      ethService;
    });

    it.only("errors if cannot get a signer", async () => {
      channelState.networkContext.chainId = 1234;
      const result = await ethService.sendWithdrawTx(channelState, minTx);
      assertResult(result, true, ChainError.reasons.SignerNotFound);
    });

    it("errors if multisig code cannot be retrieved", async () => {
      stub(ethService, "getCode").resolves(Result.fail(new ChainError("getCode error")));
      const result = await ethService.sendWithdrawTx(channelState, minTx);
      assertResult(result, true, "getCode error");
    });

    it("errors if multisig is already deployed", async () => {
      stub(ethService, "getCode").resolves(Result.ok(mkHash("0xabc")));
      const result = await ethService.sendDeployChannelTx(channelState, One);
      assertResult(result, true, ChainError.reasons.MultisigDeployed);
    });

    it("errors if multisig deployment fails without deposit", async () => {
      stub(ethService, "sendTxWithRetries").resolves(Result.fail(new ChainError(ChainError.reasons.TxReverted)));
      const result = await ethService.sendDeployChannelTx(channelState, One);
      assertResult(result, true, ChainError.reasons.TxReverted);
    });

    it("errors if multisig deployment returns nothing", async () => {
      stub(ethService, "sendTxWithRetries").resolves(Result.ok(undefined));
      const result = await ethService.sendDeployChannelTx(channelState, One);
      assertResult(result, true, ChainError.reasons.MultisigDeployed);
    });

    it("errors if deposit and is not alice", async () => {
      signer.getAddress.resolves(channelState.bob);
      const result = await ethService.sendDeployChannelTx(channelState, One, {
        amount: "1",
        assetId: AddressZero,
      });
      assertResult(result, true, ChainError.reasons.FailedToDeploy);
    });

    it("errors if deposit and cannot get onchain balance", async () => {
      stub(ethService, "getOnchainBalance").resolves(Result.fail(new ChainError(ChainError.reasons.TxNotFound)));
      const result = await ethService.sendDeployChannelTx(channelState, One, {
        amount: "1",
        assetId: AddressZero,
      });
      assertResult(result, true, ChainError.reasons.TxNotFound);
    });

    it("errors if deposit and not enough onchain balance", async () => {
      stub(ethService, "getOnchainBalance").resolves(Result.ok(BigNumber.from("9")));
      const result = await ethService.sendDeployChannelTx(channelState, One, {
        amount: "10",
        assetId: AddressZero,
      });
      assertResult(result, true, ChainError.reasons.NotEnoughFunds);
    });

    it("sendDepositATx with tokens if eth deposit + multisig deployed, error on approve", async () => {
      approveMock.resolves(Result.fail(new ChainError(ChainError.reasons.NotEnoughFunds)));
      const result = await ethService.sendDeployChannelTx(channelState, One, {
        amount: "1",
        assetId: mkAddress("0xa"),
      });
      assertResult(result, true, ChainError.reasons.NotEnoughFunds);
    });

    it("happy: calls sendDepositATx with native asset if eth deposit + multisig deployed", async () => {
      const result = await ethService.sendDeployChannelTx(channelState, One, {
        amount: "1",
        assetId: AddressZero,
      });
      assertResult(result, false);
      const call = sendTxWithRetriesMock.getCall(0);
      expect(call.args[0]).to.eq(channelState.channelAddress);
      expect(call.args[1]).to.eq(channelState.networkContext.chainId);
      expect(call.args[2]).to.eq("deployWithDepositAlice");
    });

    it("happy: calls sendDepositATx with tokens if eth deposit + multisig deployed", async () => {
      const result = await ethService.sendDeployChannelTx(channelState, One, {
        amount: "1",
        assetId: mkAddress("0xa"),
      });
      assertResult(result, false);
      const approveCall = approveMock.getCall(0);
      expect(approveCall.args[0]).to.eq(channelState.channelAddress);
      expect(approveCall.args[1]).to.eq(channelState.networkContext.chainId);
      expect(approveCall.args[2]).to.eq("deployWithDepositAlice");
      const call = sendTxWithRetriesMock.getCall(0);
      expect(call.args[0]).to.eq(channelState.channelAddress);
      expect(call.args[1]).to.eq(channelState.networkContext.chainId);
      expect(call.args[2]).to.eq("deployWithDepositAlice");
    });
  });
});
