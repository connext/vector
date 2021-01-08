import { VectorChainReader } from "@connext/vector-contracts";
import {
  HashlockTransferResolverEncoding,
  HashlockTransferStateEncoding,
  RegisteredTransfer,
  TransferNames,
  Result,
  NodeParams,
  DEFAULT_TRANSFER_TIMEOUT,
  UpdateType,
  INodeService,
  ChainError,
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
  createTestChannelState,
  ServerNodeServiceError,
} from "@connext/vector-utils";
import { HashZero } from "@ethersproject/constants";
import * as Sinon from "sinon";

import { config } from "../../config";
import { ForwardTransferCreationError } from "../../errors";
import { PrismaStore, RouterUpdateType } from "../../services/store";
import { cancelCreatedTransfer, attemptTransferWithCollateralization } from "../../services/transfer";
import * as collateral from "../../services/collateral";

const testName = "Router transfer service";

const { log } = getTestLoggers(testName, config.logLevel as any);

describe(testName, () => {
  describe("attemptTransferWithCollateralization", () => {
    // Declare mocks
    let nodeService: Sinon.SinonStubbedInstance<RestServerNodeService>;
    let store: Sinon.SinonStubbedInstance<PrismaStore>;
    let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;
    let justInTimeCollateral: Sinon.SinonStub;

    // Declare constants
    const routerPublicIdentifier = mkPublicIdentifier("vectorIII");
    const routerAddr = mkAddress("0xaaa");
    const recipient = mkPublicIdentifier("vectorRRR");
    const recipientAddr = mkAddress("0xeee");
    const channelAddress = mkAddress("0xccc");
    const transferId = getRandomBytes32();
    const routingId = getRandomBytes32();

    // Declare helpers
    const mkParams = (overrides: Partial<NodeParams.ConditionalTransfer> = {}) => {
      return {
        channelAddress,
        amount: "123",
        assetId: mkAddress(),
        recipient,
        recipientChainId: parseInt(Object.keys(config.chainProviders)[0]),
        recipientAssetId: mkAddress(),
        timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
        meta: { hello: "world" },
        type: TransferNames.HashlockTransfer,
        details: { lockHash: getRandomBytes32(), expiry: "0" },
        publicIdentifier: routerPublicIdentifier,
        ...overrides,
      };
    };

    beforeEach(async () => {
      // Create the stubs
      nodeService = Sinon.createStubInstance(RestServerNodeService);
      store = Sinon.createStubInstance(PrismaStore);
      chainReader = Sinon.createStubInstance(VectorChainReader);
      justInTimeCollateral = Sinon.stub(collateral, "justInTimeCollateral");

      // Default all stubs to return sucessful values
      nodeService.sendIsAliveMessage.resolves(Result.ok({ channelAddress }));
      store.queueUpdate.resolves(undefined);
      justInTimeCollateral.resolves(Result.ok(undefined));
      nodeService.conditionalTransfer.resolves(Result.ok({ channelAddress, transferId, routingId }));
    });

    afterEach(() => {
      Sinon.restore();
      Sinon.reset();
    });

    it("should queue update if receiver is offline && requireOnline == false", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit, {
        channelAddress,
        aliceIdentifier: routerPublicIdentifier,
        alice: routerAddr,
        bobIdentifier: recipient,
        bob: recipientAddr,
        assetIds: [mkAddress()],
        balances: [{ to: [routerAddr, recipientAddr], amount: ["700", "53"] }],
      });
      nodeService.sendIsAliveMessage.resolves(Result.fail(new Error("fail") as any));
      const params = mkParams();
      const res = await attemptTransferWithCollateralization(
        params,
        channel,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader,
        log,
        false,
      );
      expect(res.getError()).to.be.undefined;
      expect(res.getValue()).to.be.undefined;
      expect(store.queueUpdate.calledOnceWithExactly(channelAddress, RouterUpdateType.TRANSFER_CREATION, params)).to.be
        .true;
    });

    it("should work if receiver is online and properly collateralized", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit, {
        channelAddress,
        aliceIdentifier: routerPublicIdentifier,
        alice: routerAddr,
        bobIdentifier: recipient,
        bob: recipientAddr,
        assetIds: [mkAddress()],
        balances: [{ to: [routerAddr, recipientAddr], amount: ["700", "53"] }],
      });
      const res = await attemptTransferWithCollateralization(
        mkParams(),
        channel,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader,
        log,
        false,
      );
      expect(res.getError()).to.be.undefined;
      expect(res.getValue()).to.be.deep.eq({ channelAddress, transferId, routingId });
    });

    it("should work if receiver is online and undercollateralized", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit, {
        channelAddress,
        aliceIdentifier: routerPublicIdentifier,
        alice: routerAddr,
        bobIdentifier: recipient,
        bob: recipientAddr,
        assetIds: [mkAddress()],
        balances: [{ to: [routerAddr, recipientAddr], amount: ["0", "53"] }],
      });
      const res = await attemptTransferWithCollateralization(
        mkParams(),
        channel,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader,
        log,
        false,
      );
      expect(res.getError()).to.be.undefined;
      expect(res.getValue()).to.be.deep.eq({ channelAddress, transferId, routingId });
      expect(justInTimeCollateral.callCount).to.be.eq(1);
    });

    it("should fail if recipient if offline && requireOnline == true", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit, {
        channelAddress,
        aliceIdentifier: routerPublicIdentifier,
        alice: routerAddr,
        bobIdentifier: recipient,
        bob: recipientAddr,
        assetIds: [mkAddress()],
        balances: [{ to: [routerAddr, recipientAddr], amount: ["0", "53"] }],
      });
      nodeService.sendIsAliveMessage.resolves(Result.fail(new Error("fail") as any));
      const res = await attemptTransferWithCollateralization(
        mkParams(),
        channel,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader,
        log,
        true,
      );
      expect(res.getError().message).to.be.eq(ForwardTransferCreationError.reasons.ReceiverOffline);
      expect(res.getError().context.shouldCancelSender).to.be.true;
    });

    it("should fail if store.queueUpdate fails", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit, {
        channelAddress,
        aliceIdentifier: routerPublicIdentifier,
        alice: routerAddr,
        bobIdentifier: recipient,
        bob: recipientAddr,
        assetIds: [mkAddress()],
        balances: [{ to: [routerAddr, recipientAddr], amount: ["700", "53"] }],
      });
      nodeService.sendIsAliveMessage.resolves(Result.fail(new Error("fail") as any));
      store.queueUpdate.rejects(new Error("fail"));
      const res = await attemptTransferWithCollateralization(
        mkParams(),
        channel,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader,
        log,
        false,
      );
      expect(res.getError().message).to.be.eq(ForwardTransferCreationError.reasons.ErrorQueuingReceiverUpdate);
      expect(res.getError().context.shouldCancelSender).to.be.true;
      expect(res.getError().context.storeError).to.be.eq("fail");
    });

    it("should fail if undercollateralized && requestCollateral fails", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit, {
        channelAddress,
        aliceIdentifier: routerPublicIdentifier,
        alice: routerAddr,
        bobIdentifier: recipient,
        bob: recipientAddr,
        assetIds: [mkAddress()],
        balances: [{ to: [routerAddr, recipientAddr], amount: ["0", "53"] }],
      });
      justInTimeCollateral.resolves(Result.fail(new ChainError("fail")));
      const res = await attemptTransferWithCollateralization(
        mkParams(),
        channel,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader,
        log,
        true,
      );
      expect(res.getError().message).to.be.eq(ForwardTransferCreationError.reasons.UnableToCollateralize);
      expect(res.getError().context.shouldCancelSender).to.be.true;
    });

    it("should fail if node.conditionalTransfer fails", async () => {
      const { channel } = createTestChannelState(UpdateType.deposit, {
        channelAddress,
        aliceIdentifier: routerPublicIdentifier,
        alice: routerAddr,
        bobIdentifier: recipient,
        bob: recipientAddr,
        assetIds: [mkAddress()],
        balances: [{ to: [routerAddr, recipientAddr], amount: ["0", "53"] }],
      });
      nodeService.conditionalTransfer.resolves(Result.fail(new ChainError("fail") as any));
      const res = await attemptTransferWithCollateralization(
        mkParams(),
        channel,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader,
        log,
        true,
      );
      expect(res.getError().message).to.be.eq(ForwardTransferCreationError.reasons.ErrorForwardingTransfer);
      expect(res.getError().context.shouldCancelSender).to.be.false;
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
      nodeService.getRegisteredTransfers.resolves(
        Result.fail(new ChainError(ServerNodeServiceError.reasons.Timeout) as any),
      );

      const res = await cancelCreatedTransfer(
        cancellationReason,
        toCancel,
        routerPublicIdentifier,
        nodeService as any,
        store,
        log,
      );

      expect(res.getError().message).to.be.eq(ForwardTransferCreationError.reasons.FailedToCancelSenderTransfer);
      expect(res.getError().context).to.containSubset({
        cancellationError: { message: ServerNodeServiceError.reasons.Timeout },
        channelAddress,
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

      expect(res.getError().message).to.be.eq(ForwardTransferCreationError.reasons.FailedToCancelSenderTransfer);
      expect(res.getError().context).to.containSubset({
        cancellationError: "Sender transfer not in registry info",
        channelAddress,
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

      expect(res.getError().message).to.be.eq(ForwardTransferCreationError.reasons.FailedToCancelSenderTransfer);
      expect(res.getError().context).to.containSubset({
        cancellationError: "Sender transfer not in registry info",
        channelAddress,
        senderTransfer: transferId,
        cancellationReason,
        transferDefinition: toCancel.transferDefinition,
        registered: [],
      });
      // Verify nothing enqueued
      expect(store.queueUpdate.callCount).to.be.eq(0);
    });

    it("should fail if store.queueUpdate fails", async () => {
      nodeService.resolveTransfer.resolves(Result.fail(new ChainError(ServerNodeServiceError.reasons.Timeout) as any));
      store.queueUpdate.rejects(new Error("fail"));

      const res = await cancelCreatedTransfer(
        cancellationReason,
        toCancel,
        routerPublicIdentifier,
        nodeService as any,
        store,
        log,
      );

      expect(res.getError().message).to.be.eq(ForwardTransferCreationError.reasons.FailedToCancelSenderTransfer);
      expect(res.getError().context).to.containSubset({
        cancellationError: { message: ServerNodeServiceError.reasons.Timeout },
        channelAddress,
        transferId,
        cancellationReason,
        queueError: "fail",
      });
      // Verify nothing enqueued
      expect(store.queueUpdate.callCount).to.be.eq(1);
    });

    it("should fail without enqueueing if resolveTransfer fails && enqueue == false", async () => {
      nodeService.resolveTransfer.resolves(Result.fail(new ChainError(ServerNodeServiceError.reasons.Timeout) as any));

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

      expect(res.getError().message).to.be.eq(ForwardTransferCreationError.reasons.FailedToCancelSenderTransfer);
      expect(res.getError().context).to.containSubset({
        cancellationError: { message: ServerNodeServiceError.reasons.Timeout },
        channelAddress,
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
      nodeService.resolveTransfer.resolves(Result.fail(new ChainError(ServerNodeServiceError.reasons.Timeout) as any));

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
