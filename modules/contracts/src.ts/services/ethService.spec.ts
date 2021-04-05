import {
  ChainError,
  FullChannelState,
  IChainServiceStore,
  IChannelSigner,
  Result,
  TransactionResponseWithResult,
} from "@connext/vector-types";
import {
  ChannelSigner,
  createTestChannelState,
  expect,
  getBalanceForAssetId,
  getTestLoggers,
  MemoryStoreService,
  mkHash,
} from "@connext/vector-utils";
import { AddressZero, One, Zero } from "@ethersproject/constants";
import { JsonRpcProvider } from "@ethersproject/providers";
import { BigNumber } from "ethers";
import { restore, reset, createStubInstance, SinonStubbedInstance, stub } from "sinon";

import { EthereumChainService } from "./ethService";

let storeMock: SinonStubbedInstance<IChainServiceStore>;
let signer: SinonStubbedInstance<IChannelSigner>;
let ethService: EthereumChainService;
let provider1337: SinonStubbedInstance<JsonRpcProvider>;
let provider1338: SinonStubbedInstance<JsonRpcProvider>;

const assertResult = (result: Result<any>, isError: boolean, errorMessage?: string) => {
  if (isError) {
    expect(result.isError).to.be.true;
    expect(result.getError()?.message).to.be.eq(errorMessage);
  }
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
    ethService = new EthereumChainService(
      storeMock,
      {
        1337: provider1337,
        1338: provider1338,
      },
      signer,
      log,
    );
    stub(ethService, "getCode").resolves(Result.ok("0x"));
    stub(ethService, "sendTxWithRetries").resolves(
      Result.ok({
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
        wait: () => Promise.resolve({}),
      } as TransactionResponseWithResult),
    );
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
  });
});
