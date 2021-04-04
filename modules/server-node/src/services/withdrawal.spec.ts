import { VectorChainService, WithdrawCommitment } from "@connext/vector-contracts";
import { ChainError, Result, UpdateType, WithdrawCommitmentJson } from "@connext/vector-types";
import {
  createTestChannelState,
  expect,
  mkAddress,
  mkHash,
  getRandomChannelSigner,
  getRandomBytes32,
  mkSig,
} from "@connext/vector-utils";
import { HashZero } from "@ethersproject/constants";
import { parseUnits } from "@ethersproject/units";
import Sinon from "sinon";

import { ResubmitWithdrawalError } from "../helpers/errors";
import * as nodeHelpers from "../helpers/nodes";

import { PrismaStore } from "./store";
import { submitMainnetWithdrawalsIfNeeded, submitUnsubmittedWithdrawals, submitWithdrawalToChain } from "./withdrawal";

const testName = "Node withdrawal submission";

describe(testName, () => {
  // declare mocks
  let getChainServiceStub: Sinon.SinonStub;
  let chainService: Sinon.SinonStubbedInstance<VectorChainService>;
  let store: Sinon.SinonStubbedInstance<PrismaStore>;

  // generate mock commitment
  const alice = getRandomChannelSigner();
  const bob = getRandomChannelSigner();
  const transferId = getRandomBytes32();
  const transferDefinition = mkAddress("0xdef");
  const channelAddress = mkAddress("0xccc");
  const transactionHash = mkHash("0xttt");

  const prepEnv = async () => {
    const json: WithdrawCommitmentJson = {
      channelAddress,
      amount: "10",
      alice: alice.address,
      bob: bob.address,
      assetId: mkAddress(),
      aliceSignature: undefined,
      bobSignature: undefined,
      recipient: mkAddress("0xeee"),
      nonce: "12",
      callData: "0x",
      callTo: mkAddress(),
      transactionHash,
    };
    const commitment = await WithdrawCommitment.fromJson(json);
    const aliceSig = await alice.signMessage(commitment.hashToSign());
    const bobSig = await bob.signMessage(commitment.hashToSign());
    await commitment.addSignatures(aliceSig, bobSig);
    const { channel, transfer } = createTestChannelState(
      UpdateType.create,
      {
        alice: alice.address,
        aliceIdentifier: alice.publicIdentifier,
        bob: bob.address,
        bobIdentifier: bob.publicIdentifier,
        channelAddress,
        networkContext: { chainId: 1 },
      },
      { transferId, transferDefinition, meta: {} },
    );
    return { channel, transfer, commitment: commitment.toJson() };
  };

  beforeEach(async () => {
    getChainServiceStub = Sinon.stub(nodeHelpers, "getChainService");
    chainService = Sinon.createStubInstance(VectorChainService);
    store = Sinon.createStubInstance(PrismaStore);

    // default all mocks to be ok
    chainService.sendWithdrawTx.resolves(Result.ok({ hash: transactionHash }) as any);
    chainService.getRegisteredTransferByName.resolves(Result.ok({ definition: transferDefinition }) as any);
    chainService.getWithdrawalTransactionRecord.resolves(Result.ok(false));
    store.saveWithdrawalCommitment.resolves();
    getChainServiceStub.returns(chainService);
  });

  afterEach(() => {
    // Restore all mocks
    Sinon.restore();
  });

  describe("submitWithdrawalToChain", () => {
    it("should fail if it cannot find the chain service", async () => {
      getChainServiceStub.returns(undefined);
      const { channel, transfer, commitment } = await prepEnv();

      const result = await submitWithdrawalToChain(channel, { commitment, transfer }, store);
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(ResubmitWithdrawalError.reasons.ChainServiceNotFound);
    });

    it("should fail if chainService.sendWithdrawTx fails and its not because the withdrawal was already submitted", async () => {
      const { channel, transfer, commitment } = await prepEnv();
      chainService.sendWithdrawTx.resolves(Result.fail(new ChainError("fail")));

      const result = await submitWithdrawalToChain(channel, { commitment, transfer }, store);
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(ResubmitWithdrawalError.reasons.SubmissionFailed);
    });

    it("should fail if store.saveWithdrawalCommitment fails", async () => {
      const { channel, transfer, commitment } = await prepEnv();
      store.saveWithdrawalCommitment.rejects(new Error("fail"));

      const result = await submitWithdrawalToChain(channel, { commitment, transfer }, store);
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(ResubmitWithdrawalError.reasons.SavingCommitmentFailed);
    });

    it("should work when withdrawal was already submitted", async () => {
      const { channel, transfer, commitment } = await prepEnv();
      chainService.getWithdrawalTransactionRecord.resolves(Result.ok(true));

      const result = await submitWithdrawalToChain(channel, { commitment, transfer }, store);
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.deep.eq({
        channelAddress: channel.channelAddress,
        transferId: transfer.transferId,
        transactionHash: HashZero,
      });
    });

    it("should work", async () => {
      const { channel, transfer, commitment } = await prepEnv();

      const result = await submitWithdrawalToChain(channel, { commitment, transfer }, store);
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.deep.eq({
        channelAddress: channel.channelAddress,
        transferId: transfer.transferId,
        transactionHash: commitment.transactionHash,
      });
    });
  });

  describe("submitUnsubmittedWithdrawals", () => {
    it("should fail if it cannot get unsubmitted withdrawals from store", async () => {
      const { channel } = await prepEnv();
      store.getUnsubmittedWithdrawals.rejects(new Error("fail"));

      const result = await submitUnsubmittedWithdrawals([channel], store);
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(ResubmitWithdrawalError.reasons.CouldNotGetCommitments);
    });

    it("should not include result if it cannot find channel", async () => {
      const { transfer, commitment } = await prepEnv();
      const { channel } = createTestChannelState(UpdateType.resolve, { channelAddress: mkAddress("0xdddeee") });
      store.getUnsubmittedWithdrawals.resolves([{ commitment, transfer }]);

      const result = await submitUnsubmittedWithdrawals([channel], store);
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.deep.eq([]);
    });

    it("should not include result if submitWithdrawalToChain fails", async () => {
      const { channel, transfer, commitment } = await prepEnv();
      store.getUnsubmittedWithdrawals.resolves([{ commitment, transfer }]);
      chainService.sendWithdrawTx.resolves(Result.fail(new ChainError("fail")));

      const result = await submitUnsubmittedWithdrawals([channel], store);
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.deep.eq([]);
    });

    it("should work", async () => {
      const { channel, transfer, commitment } = await prepEnv();
      store.getUnsubmittedWithdrawals.resolves([{ commitment, transfer }]);

      const result = await submitUnsubmittedWithdrawals([channel], store);
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.deep.eq([
        {
          channelAddress: channel.channelAddress,
          transferId: transfer.transferId,
          transactionHash: commitment.transactionHash,
        },
      ]);
    });
  });

  describe("submitMainnetWithdrawalsIfNeeded", () => {
    it("should fail if it cannot get the channels from store", async () => {
      store.getChannelStates.rejects(new Error("fail"));

      const result = await submitMainnetWithdrawalsIfNeeded([alice.publicIdentifier], store);
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(ResubmitWithdrawalError.reasons.CouldNotGetChannels);
    });

    it("should fail if it cannot get unsubmitted commitments", async () => {
      const { channel } = await prepEnv();
      store.getChannelStates.resolves([channel]);
      store.getUnsubmittedWithdrawals.rejects(new Error("fail"));

      const result = await submitMainnetWithdrawalsIfNeeded([alice.publicIdentifier], store);
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(ResubmitWithdrawalError.reasons.CouldNotGetCommitments);
    });

    it("should fail if it cannot find chain service", async () => {
      const { channel } = await prepEnv();
      store.getChannelStates.resolves([channel]);
      store.getUnsubmittedWithdrawals.resolves([]);
      getChainServiceStub.returns(undefined);

      const result = await submitMainnetWithdrawalsIfNeeded([alice.publicIdentifier], store);
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(ResubmitWithdrawalError.reasons.ChainServiceNotFound);
    });

    it("should fail if it cannot get gas price", async () => {
      const { channel, commitment, transfer } = await prepEnv();
      store.getChannelStates.resolves([channel]);
      store.getUnsubmittedWithdrawals.resolves([{ commitment, transfer }]);
      chainService.getGasPrice.resolves(Result.fail(new ChainError("fail")));

      const result = await submitMainnetWithdrawalsIfNeeded([alice.publicIdentifier], store);
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(ResubmitWithdrawalError.reasons.CouldNotGetGasPrice);
    });

    it("should only submit old transactions if gas price is too high", async () => {
      const { channel, transfer, commitment } = await prepEnv();
      store.getChannelStates.resolves([channel]);
      const elapse = 8 * 24 * 60 * 60 * 1000; // 8 days
      transfer.meta.resolvedAt = Date.now() - elapse;
      store.getUnsubmittedWithdrawals.resolves([{ commitment, transfer }]);
      chainService.getGasPrice.resolves(Result.ok(parseUnits("1", "ether")));

      const result = await submitMainnetWithdrawalsIfNeeded([alice.publicIdentifier], store);
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.deep.eq([
        {
          channelAddress: channel.channelAddress,
          transactionHash: commitment.transactionHash,
          transferId: transfer.transferId,
        },
      ]);
    });

    it("should submit all transactions if gas price is low enough", async () => {
      const { channel, transfer, commitment } = await prepEnv();
      store.getChannelStates.resolves([channel]);
      store.getUnsubmittedWithdrawals.resolves([{ commitment, transfer }]);
      chainService.getGasPrice.resolves(Result.ok(parseUnits("100", "gwei")));

      const result = await submitMainnetWithdrawalsIfNeeded([alice.publicIdentifier], store);
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.deep.eq([
        {
          channelAddress: channel.channelAddress,
          transactionHash: commitment.transactionHash,
          transferId: transfer.transferId,
        },
      ]);
    });

    it("should not submit cancelled withdrawals", async () => {
      const { channel, transfer, commitment } = await prepEnv();
      store.getChannelStates.resolves([channel]);
      transfer.transferResolver = { responderSignature: mkSig("0x0") };
      store.getUnsubmittedWithdrawals.resolves([{ commitment, transfer }]);
      chainService.getGasPrice.resolves(Result.ok(parseUnits("100", "gwei")));

      const result = await submitMainnetWithdrawalsIfNeeded([alice.publicIdentifier], store);
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.deep.eq([]);
    });
  });
});
