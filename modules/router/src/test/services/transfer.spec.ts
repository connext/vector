import {
  HashlockTransferResolverEncoding,
  HashlockTransferStateEncoding,
  RegisteredTransfer,
  TransferNames,
  Result,
  NodeError,
} from "@connext/vector-types";
import {
  createTestFullHashlockTransferState,
  encodeTransferResolver,
  expect,
  getRandomBytes32,
  getTestLoggers,
  mkAddress,
  mkPublicIdentifier,
  RestServerNodeService,
} from "@connext/vector-utils";
import { HashZero } from "@ethersproject/constants";
import * as Sinon from "sinon";

import { config } from "../../config";
import { ForwardTransferError } from "../../errors";
import { PrismaStore } from "../../services/store";
import { cancelCreatedTransfer } from "../../services/transfer";

const testName = "Router transfer service";

const { log } = getTestLoggers(testName, config.logLevel as any);

describe.only(testName, () => {
  describe("transferWithAutoCollateralization", () => {
    describe("should properly queue update", () => {
      it("should work", async () => {});
      it("should work if undercollateralized", async () => {});
    });
    describe("should work without queueing update", () => {
      it("should fail if requestCollateral fails", async () => {});
      it("should fail if conditionalTransfer fails", async () => {});
      it("should work", async () => {});
      it("should work if undercollateralized", async () => {});
    });
  });

  describe("cancelCreatedTransfer", () => {
    // Declare mocks
    let nodeService: Sinon.SinonStubbedInstance<RestServerNodeService>;
    let store: Sinon.SinonStubbedInstance<PrismaStore>;

    const registryInfo: RegisteredTransfer = {
      definition: mkAddress("0xdef"),
      name: TransferNames.HashlockTransfer,
      stateEncoding: HashlockTransferStateEncoding,
      resolverEncoding: HashlockTransferResolverEncoding,
      encodedCancel: encodeTransferResolver({ preImage: HashZero }, HashlockTransferResolverEncoding),
    };

    const channelAddress = mkAddress("0xccc");
    const transferId = getRandomBytes32();
    const routerPublicIdentifier = mkPublicIdentifier("vectorRRR");
    const routerAddr = mkAddress("0xaaa");
    const cancellationReason = "something mildly inappropriate";
    const toCancel = createTestFullHashlockTransferState({
      transferId,
      channelAddress,
      responder: routerAddr,
      responderIdentifier: routerPublicIdentifier,
    });
    const resolveResult = { channelAddress, transferId };

    beforeEach(async () => {
      // Set stubs with default okay values
      nodeService = Sinon.createStubInstance(RestServerNodeService);
      nodeService.resolveTransfer.resolves(Result.ok(resolveResult));
      nodeService.getRegisteredTransfers.resolves(Result.ok([registryInfo]));

      store = Sinon.createStubInstance(PrismaStore);
      store.queueUpdate.resolves(undefined);
    });

    afterEach(() => {
      Sinon.restore();
    });

    it("should fail without queueing if cannot get registry info", async () => {
      nodeService.getRegisteredTransfers.resolves(Result.fail(new Error(NodeError.reasons.Timeout) as any));

      const res = await cancelCreatedTransfer(
        cancellationReason,
        toCancel,
        routerPublicIdentifier,
        nodeService as any,
        store,
        log,
      );

      expect(res.getError().message).to.be.eq(ForwardTransferError.reasons.FailedToCancelSenderTransfer);
      expect(res.getError().context).to.containSubset({
        cancellationError: NodeError.reasons.Timeout,
        senderChannel: channelAddress,
        senderTransfer: transferId,
        cancellationReason,
      });
      // Verify nothing enqueued
      expect(store.queueUpdate.callCount).to.be.eq(0);
    });

    it("should fail without queueing if cannot get registry.encodedCancel", async () => {
      nodeService.getRegisteredTransfers.resolves(Result.ok([]));

      const res = await cancelCreatedTransfer(
        cancellationReason,
        toCancel,
        routerPublicIdentifier,
        nodeService as any,
        store,
        log,
      );

      expect(res.getError().message).to.be.eq(ForwardTransferError.reasons.FailedToCancelSenderTransfer);
      expect(res.getError().context).to.containSubset({
        cancellationError: "Sender transfer not in registry info",
        senderChannel: channelAddress,
        senderTransfer: transferId,
        cancellationReason,
        transferDefinition: toCancel.transferDefinition,
        registered: [],
      });
      // Verify nothing enqueued
      expect(store.queueUpdate.callCount).to.be.eq(0);
    });

    it("should fail without queueing if cannot get registry.resolverEncoding", async () => {
      nodeService.getRegisteredTransfers.resolves(Result.ok([]));

      const res = await cancelCreatedTransfer(
        cancellationReason,
        toCancel,
        routerPublicIdentifier,
        nodeService as any,
        store,
        log,
      );

      expect(res.getError().message).to.be.eq(ForwardTransferError.reasons.FailedToCancelSenderTransfer);
      expect(res.getError().context).to.containSubset({
        cancellationError: "Sender transfer not in registry info",
        senderChannel: channelAddress,
        senderTransfer: transferId,
        cancellationReason,
        transferDefinition: toCancel.transferDefinition,
        registered: [],
      });
      // Verify nothing enqueued
      expect(store.queueUpdate.callCount).to.be.eq(0);
    });

    it("should fail if store.queueUpdate fails", async () => {
      nodeService.resolveTransfer.resolves(Result.fail(new Error(NodeError.reasons.Timeout) as any));
      store.queueUpdate.rejects(new Error("fail"));

      const res = await cancelCreatedTransfer(
        cancellationReason,
        toCancel,
        routerPublicIdentifier,
        nodeService as any,
        store,
        log,
      );

      expect(res.getError().message).to.be.eq(ForwardTransferError.reasons.FailedToCancelSenderTransfer);
      expect(res.getError().context).to.containSubset({
        cancellationError: NodeError.reasons.Timeout,
        channel: channelAddress,
        transferId,
        cancellationReason,
        queueError: "fail",
      });
      // Verify nothing enqueued
      expect(store.queueUpdate.callCount).to.be.eq(1);
    });

    it("should fail without enqueueing if resolveTransfer fails && enqueue = false", async () => {
      nodeService.resolveTransfer.resolves(Result.fail(new Error(NodeError.reasons.Timeout) as any));

      const res = await cancelCreatedTransfer(
        cancellationReason,
        toCancel,
        routerPublicIdentifier,
        nodeService as any,
        store,
        log,
        {},
        false,
      );

      expect(res.getError().message).to.be.eq(ForwardTransferError.reasons.FailedToCancelSenderTransfer);
      expect(res.getError().context).to.containSubset({
        cancellationError: NodeError.reasons.Timeout,
        channel: channelAddress,
        transferId,
        cancellationReason,
      });
      // Verify nothing enqueued
      expect(store.queueUpdate.callCount).to.be.eq(0);
    });

    it("should work if resolveTransfer works", async () => {
      const res = await cancelCreatedTransfer(
        cancellationReason,
        toCancel,
        routerPublicIdentifier,
        nodeService as any,
        store,
        log,
      );

      expect(res.getError()).to.be.undefined;
      expect(res.getValue()).to.be.eq(resolveResult);
      // Verify not enqueued
      expect(store.queueUpdate.callCount).to.be.eq(0);
    });

    it("should properly enqueue resolveTransfer updates", async () => {
      nodeService.resolveTransfer.resolves(Result.fail(new Error(NodeError.reasons.Timeout) as any));

      const res = await cancelCreatedTransfer(
        cancellationReason,
        toCancel,
        routerPublicIdentifier,
        nodeService as any,
        store,
        log,
      );

      expect(res.getError()).to.be.undefined;
      expect(res.getValue()).to.be.undefined;
      // Verify enqueued correctly
      expect(store.queueUpdate.callCount).to.be.eq(1);
      console.log("store.queueUpdate.firstCall.args", store.queueUpdate.firstCall.args);
      expect(store.queueUpdate.firstCall.args[2]).to.containSubset({
        publicIdentifier: routerPublicIdentifier,
        channelAddress,
        transferId,
        meta: {
          cancellationReason,
          cancellationContext: {},
        },
      });
    });
  });
});
