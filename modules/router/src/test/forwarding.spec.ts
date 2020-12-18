/* eslint-disable @typescript-eslint/no-empty-function */
import {
  ConditionalTransferCreatedPayload,
  FullChannelState,
  INodeService,
  NodeError,
  Result,
  TransferNames,
  TRANSFER_DECREMENT,
  FullTransferState,
  UpdateType,
  Values,
  HashlockTransferStateEncoding,
  HashlockTransferResolverEncoding,
} from "@connext/vector-types";
import {
  createTestChannelState,
  expect,
  getRandomBytes32,
  mkAddress,
  mkPublicIdentifier,
  RestServerNodeService,
  getTestLoggers,
  encodeTransferResolver,
  decodeTransferResolver,
} from "@connext/vector-utils";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { BigNumber } from "@ethersproject/bignumber";
import Sinon from "sinon";

import { PrismaStore, RouterUpdateType } from "../services/store";
import { forwardTransferCreation, ForwardTransferError } from "../forwarding";
import { config } from "../config";
import * as swapService from "../services/swap";
import * as collateral from "../collateral";

import { mockProvider } from "./utils/mocks";

const testName = "Forwarding";

const { log: logger } = getTestLoggers(testName, config.logLevel as any);

type TransferCreatedTestContext = {
  senderTransfer: FullTransferState;
  senderChannel: FullChannelState;
  receiverChannel: FullChannelState;
  event: ConditionalTransferCreatedPayload;
};

describe("Forwarding", () => {
  describe("forwardTransferCreation", () => {
    let node: Sinon.SinonStubbedInstance<RestServerNodeService>;
    let store: Sinon.SinonStubbedInstance<PrismaStore>;
    let data: ConditionalTransferCreatedPayload;
    let senderChannel: FullChannelState;
    let receiverChannel: FullChannelState;
    let getSwappedAmount: Sinon.SinonStub;
    let requestCollateral: Sinon.SinonStub;

    const routerPublicIdentifier = mkPublicIdentifier("vectorRRR");
    const aliceIdentifier = mkPublicIdentifier("vectorA");
    const bobIdentifier = mkPublicIdentifier("vectorB");
    const signerAddress = mkAddress("0xBBB");
    const chainProviders = { 1337: mockProvider };
    const testLog = logger.child({ module: "forwardTransferCreation" });

    const generateDefaultTestContext = (): TransferCreatedTestContext => {
      const transferMeta = {
        routingId: getRandomBytes32(),
        path: [{ recipient: bobIdentifier }],
      };
      const { channel: senderChannel, transfer: senderTransfer } = createTestChannelState(
        UpdateType.create,
        {
          aliceIdentifier: routerPublicIdentifier,
          bobIdentifier: aliceIdentifier,
          alice: signerAddress,
          bob: mkAddress("0xeee"),
          latestUpdate: {
            fromIdentifier: bobIdentifier,
            toIdentifier: aliceIdentifier,
          },
        },
        { meta: transferMeta, initiator: mkAddress("0xeee") },
      );

      const { channel: receiverChannel } = createTestChannelState(UpdateType.deposit, {
        aliceIdentifier: routerPublicIdentifier,
        bobIdentifier,
        alice: signerAddress,
      });

      const idx = senderChannel.assetIds.findIndex((a) => a === senderTransfer.assetId);

      const event: ConditionalTransferCreatedPayload = {
        aliceIdentifier: senderChannel.aliceIdentifier,
        bobIdentifier: senderChannel.bobIdentifier,
        channelAddress: senderChannel.channelAddress,
        channelBalance: senderChannel.balances[idx],
        activeTransferIds: [senderTransfer.transferId],
        transfer: senderTransfer,
        conditionType: TransferNames.HashlockTransfer,
      };
      return { event, senderTransfer, senderChannel, receiverChannel };
    };

    const prepEnv = (ctx: TransferCreatedTestContext = generateDefaultTestContext()): TransferCreatedTestContext => {
      const { receiverChannel, senderChannel, senderTransfer } = ctx;

      // Set mock methods for default happy case
      // get sender channel
      node.getStateChannel.onFirstCall().resolves(Result.ok(senderChannel));
      // get swapped amount (optional)
      getSwappedAmount.resolves(Result.ok(senderTransfer.balance.amount[0]));
      // get receiver channel
      node.getStateChannelByParticipants.onFirstCall().resolves(Result.ok(receiverChannel));
      // request collateral (optional)
      requestCollateral.resolves(Result.ok({ channelAddress: receiverChannel.channelAddress }));
      // create receiver transfer
      node.conditionalTransfer.onFirstCall().resolves(
        Result.ok({
          channelAddress: receiverChannel.channelAddress,
          transferId: getRandomBytes32(),
          routingId: senderTransfer.meta.routingId,
        }),
      );

      // Set mock methods for error handling
      // get registered transfer
      node.getRegisteredTransfers.onFirstCall().resolves(
        Result.ok([
          {
            definition: senderTransfer.transferDefinition,
            stateEncoding: HashlockTransferStateEncoding,
            resolverEncoding: HashlockTransferResolverEncoding,
            encodedCancel: encodeTransferResolver({ preImage: HashZero }, HashlockTransferResolverEncoding),
            name: TransferNames.HashlockTransfer,
          },
        ]),
      );
      // queue missed update
      store.queueUpdate.resolves();
      // resolve sender transfer
      node.resolveTransfer.onFirstCall().resolves(
        Result.ok({
          channelAddress: senderTransfer.channelAddress,
          transferId: senderTransfer.transferId,
          routingId: senderTransfer.meta.routingId,
        }),
      );

      return ctx;
    };

    const verifySuccessfulResult = async (
      result: Result<any, ForwardTransferError>,
      ctx: TransferCreatedTestContext,
      swapCallCount = 0,
      collateralCallCount = 0,
    ) => {
      const { senderTransfer, receiverChannel, event } = ctx;
      expect(result.getError()).to.be.undefined;
      expect(result.getValue()).to.containSubset({
        channelAddress: receiverChannel.channelAddress,
        routingId: senderTransfer.meta.routingId,
      });
      expect(result.getValue().transferId).to.be.ok;
      // Verify call stack
      expect(getSwappedAmount.callCount).to.be.eq(swapCallCount);
      expect(requestCollateral.callCount).to.be.eq(collateralCallCount);
      expect(node.conditionalTransfer.callCount).to.be.eq(1);
      const expected = {
        channelAddress: receiverChannel.channelAddress,
        amount:
          swapCallCount > 0 ? (await getSwappedAmount.returnValues[0]).getValue() : senderTransfer.balance.amount[0],
        assetId: senderTransfer.meta?.path[0]?.recipientAssetId ?? senderTransfer.assetId,
        timeout: BigNumber.from(senderTransfer.transferTimeout).sub(TRANSFER_DECREMENT).toString(),
        type: event.conditionType,
        publicIdentifier: routerPublicIdentifier,
        details: { ...senderTransfer.transferState },
        meta: {
          senderIdentifier: ctx.senderChannel.bobIdentifier,
          ...(senderTransfer.meta ?? {}),
        },
      };
      expect(node.conditionalTransfer.firstCall.args[0]).to.be.deep.eq(expected);
    };

    const verifyErrorResult = async (
      result: Result<any, ForwardTransferError>,
      ctx: TransferCreatedTestContext,
      errorReason: Values<typeof ForwardTransferError.reasons>,
      errorContext: any = {},
      senderCancelled = true,
      senderResolveFailed = false,
    ) => {
      const error = result.getError();
      expect(error).to.be.ok;
      expect(result.isError).to.be.true;
      expect(error.message).to.be.eq(errorReason);

      if (!senderCancelled) {
        console.log("!senderCancelled error.context: ", error.context);
        expect(error.context).to.containSubset({
          ...errorContext,
        });
        expect(node.resolveTransfer.callCount).to.be.eq(0);
        expect(store.queueUpdate.callCount).to.be.eq(0);
        return;
      }
      console.log("error.context: ", error.context);
      expect(error.context).to.containSubset({
        senderTransfer: ctx.senderTransfer.transferId,
        senderChannel: ctx.senderTransfer.channelAddress,
        details: "Sender transfer cancelled/queued",
        ...errorContext,
      });
      expect(node.getRegisteredTransfers.callCount).to.be.eq(1);
      const transferResolver = decodeTransferResolver(
        encodeTransferResolver({ preImage: HashZero }, HashlockTransferResolverEncoding),
        HashlockTransferResolverEncoding,
      );
      const resolveParams = {
        publicIdentifier: routerPublicIdentifier,
        channelAddress: ctx.senderTransfer.channelAddress,
        transferId: ctx.senderTransfer.transferId,
        transferResolver,
        meta: {
          cancellationReason: errorReason,
          cancellationContext: { ...errorContext },
        },
      };

      expect(node.resolveTransfer.calledOnceWithExactly(resolveParams)).to.be.true;
      if (!senderResolveFailed) {
        expect(store.queueUpdate.callCount).to.be.eq(0);
        return;
      }
      expect(
        store.queueUpdate.calledOnceWithExactly(
          ctx.senderTransfer.channelAddress,
          RouterUpdateType.TRANSFER_RESOLUTION,
          resolveParams,
        ),
      ).to.be.true;
    };

    beforeEach(async () => {
      data = generateDefaultTestContext().event;
      senderChannel = createTestChannelState("create", {
        alice: mkAddress("0xa"),
        bob: mkAddress("0xb1"),
        channelAddress: data.channelAddress,
        balances: [data.channelBalance],
      }).channel;
      receiverChannel = createTestChannelState("deposit", {
        alice: mkAddress("0xa"),
        bob: mkAddress("0xb2"),
        assetIds: [AddressZero],
        balances: [
          {
            amount: ["5", "7"],
            to: [mkAddress("0xb"), mkAddress("0xc")],
          },
        ],
      }).channel;

      // Declare stubs
      node = Sinon.createStubInstance(RestServerNodeService, {
        sendDepositTx: Promise.resolve(Result.ok({ txHash: getRandomBytes32() })),
      });
      node.getStateChannel.resolves(Result.ok(senderChannel));
      node.getStateChannelByParticipants.resolves(Result.ok(receiverChannel));
      node.conditionalTransfer.resolves(Result.ok({} as any));
      node.sendDepositTx.resolves(Result.ok({ txHash: getRandomBytes32() }));
      node.reconcileDeposit.resolves(Result.ok({ channelAddress: data.channelAddress }));
      store = Sinon.createStubInstance(PrismaStore);
      getSwappedAmount = Sinon.stub(swapService, "getSwappedAmount");
      requestCollateral = Sinon.stub(collateral, "requestCollateral");
    });

    afterEach(() => {
      Sinon.restore();
      Sinon.reset();
    });

    // Successful forwards
    it("successfully forwards a transfer creation with no swaps, no cross-chain and no collateralization", async () => {
      const ctx = prepEnv();
      const result = await forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifySuccessfulResult(result, ctx);
    });

    it("successfully forwards a transfer creation with swaps, no cross-chain and no collateralization", async () => {
      const ctx = generateDefaultTestContext();
      ctx.receiverChannel.assetIds = [mkAddress("0xfff")];
      ctx.receiverChannel.balances = [ctx.receiverChannel.balances[0]];
      ctx.senderTransfer.meta.path[0].recipientAssetId = mkAddress("0xfff");
      const mocked = prepEnv({ ...ctx });

      const result = await forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifySuccessfulResult(result, mocked, 1);
    });

    it("successfully forwards a transfer creation with no swaps, cross-chain and no collateralization", async () => {
      const ctx = generateDefaultTestContext();
      ctx.receiverChannel.networkContext.chainId = 1338;
      ctx.senderTransfer.meta.path[0].recipientChainId = 1338;
      const mocked = prepEnv({ ...ctx });

      const result = await forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifySuccessfulResult(result, mocked, 1);
    });

    it("successfully forwards a transfer creation with swaps, cross-chain, and collateralization", async () => {
      const ctx = generateDefaultTestContext();
      ctx.receiverChannel.networkContext.chainId = 1338;
      ctx.senderTransfer.meta.path[0].recipientChainId = 1338;
      ctx.senderTransfer.meta.path[0].recipientAssetId = mkAddress("0xfff");
      const mocked = prepEnv({ ...ctx });

      const result = await forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifySuccessfulResult(result, mocked, 1, 1);
    });

    // TODO: implement offline payments
    it.skip("successfully queues transfers if allowable offline && creation failed because receiver was offline", async () => {});

    // Uncancellable failures
    it("should fail without cancelling if no meta.routingId", async () => {
      const ctx = generateDefaultTestContext();
      ctx.senderTransfer.meta.routingId = undefined;
      const mocked = prepEnv({ ...ctx });

      const result = await forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifyErrorResult(
        result,
        mocked,
        ForwardTransferError.reasons.InvalidForwardingInfo,
        {
          meta: mocked.senderTransfer.meta,
          senderTransfer: mocked.senderTransfer.transferId,
          senderChannel: mocked.senderTransfer.channelAddress,
        },
        false,
      );
    });

    it("should fail without cancelling if no meta.path", async () => {
      const ctx = generateDefaultTestContext();
      ctx.senderTransfer.meta.path = undefined;
      const mocked = prepEnv({ ...ctx });

      const result = await forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifyErrorResult(
        result,
        mocked,
        ForwardTransferError.reasons.InvalidForwardingInfo,
        {
          meta: mocked.senderTransfer.meta,
          senderTransfer: mocked.senderTransfer.transferId,
          senderChannel: mocked.senderTransfer.channelAddress,
        },
        false,
      );
    });

    it("should fail without cancelling if no meta.path.recipientIdentifier", async () => {
      const ctx = generateDefaultTestContext();
      ctx.senderTransfer.meta.path = [{}];
      const mocked = prepEnv({ ...ctx });

      const result = await forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifyErrorResult(
        result,
        mocked,
        ForwardTransferError.reasons.InvalidForwardingInfo,
        {
          meta: mocked.senderTransfer.meta,
          senderTransfer: mocked.senderTransfer.transferId,
          senderChannel: mocked.senderTransfer.channelAddress,
        },
        false,
      );
    });

    it("should fail without cancelling if cannot get sender channel from store", async () => {
      const ctx = prepEnv();
      node.getStateChannel.onFirstCall().resolves(Result.fail(new NodeError(NodeError.reasons.InternalServerError)));

      const result = await forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifyErrorResult(
        result,
        ctx,
        ForwardTransferError.reasons.SenderChannelNotFound,
        {
          nodeError: NodeError.reasons.InternalServerError,
        },
        false,
      );
    });

    it("should fail without cancelling if sender channel undefined", async () => {
      const ctx = prepEnv();
      node.getStateChannel.onFirstCall().resolves(Result.ok(undefined));

      const result = await forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifyErrorResult(
        result,
        ctx,
        ForwardTransferError.reasons.SenderChannelNotFound,
        {
          channelAddress: ctx.senderChannel.channelAddress,
        },
        false,
      );
    });

    // Cancellable failures
    it("fails with cancellation if calculating swapped amount fails", async () => {
      const ctx = generateDefaultTestContext();
      ctx.receiverChannel.networkContext.chainId = 1338;
      ctx.senderTransfer.meta.path[0].recipientChainId = 1338;
      const mocked = prepEnv(ctx);
      getSwappedAmount.resolves(Result.fail(new Error("fail")));

      const result = await forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifyErrorResult(result, mocked, ForwardTransferError.reasons.UnableToCalculateSwap, {
        swapError: "fail",
        swapContext: undefined,
      });
    });

    it("fails with cancellation if getting receiver channel fails", async () => {
      const ctx = prepEnv();
      node.getStateChannelByParticipants
        .onFirstCall()
        .resolves(Result.fail(new NodeError(NodeError.reasons.InternalServerError)));

      const result = await forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifyErrorResult(result, ctx, ForwardTransferError.reasons.RecipientChannelNotFound, {
        storeError: NodeError.reasons.InternalServerError,
      });
    });

    it("fails with cancellation if no state channel available for receiver", async () => {
      const ctx = prepEnv();
      node.getStateChannelByParticipants.onFirstCall().resolves(Result.ok(undefined));

      const result = await forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifyErrorResult(result, ctx, ForwardTransferError.reasons.RecipientChannelNotFound, {
        participants: [routerPublicIdentifier, ctx.receiverChannel.bobIdentifier],
        chainId: ctx.receiverChannel.networkContext.chainId,
      });
    });

    it("fails with cancellation if request collateral fails", async () => {
      const ctx = generateDefaultTestContext();
      ctx.senderTransfer.meta.path[0].recipientAssetId = mkAddress("0xfff");
      const mocked = prepEnv({ ...ctx });
      requestCollateral.resolves(Result.fail(new Error("fail")));

      const result = await forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifyErrorResult(result, mocked, ForwardTransferError.reasons.UnableToCollateralize, {
        collateralError: "fail",
      });
    });

    // TODO: implement timeouts
    it("fails with cancellation if transfer creation fails", async () => {
      const ctx = prepEnv();
      node.conditionalTransfer
        .onFirstCall()
        .resolves(Result.fail(new NodeError(NodeError.reasons.InternalServerError)));

      const result = await forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      await verifyErrorResult(result, ctx, ForwardTransferError.reasons.ErrorForwardingTransfer, {
        createError: NodeError.reasons.InternalServerError,
      });
    });

    // TODO: Failures cancelling
    it("cancelling sender transfer should fail if cannot get registered transfers", async () => {
      const ctx = prepEnv();
      node.conditionalTransfer
        .onFirstCall()
        .resolves(Result.fail(new NodeError(NodeError.reasons.InternalServerError)));
      node.getRegisteredTransfers
        .onFirstCall()
        .resolves(Result.fail(new NodeError(NodeError.reasons.InternalServerError)));

      const result = await forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      expect(result.getError().message).to.be.eq(ForwardTransferError.reasons.FailedToCancelSenderTransfer);
      expect(result.getError().context).to.containSubset({
        cancellationError: NodeError.reasons.InternalServerError,
        routingId: ctx.senderTransfer.meta.routingId,
        senderChannel: ctx.senderTransfer.channelAddress,
        senderTransfer: ctx.senderTransfer.transferId,
        cancellationReason: ForwardTransferError.reasons.ErrorForwardingTransfer,
      });
    });

    it("cancelling transfers should fail if it cannot find transfer in registered transfers", async () => {
      const ctx = prepEnv();
      node.conditionalTransfer
        .onFirstCall()
        .resolves(Result.fail(new NodeError(NodeError.reasons.InternalServerError)));
      node.getRegisteredTransfers.onFirstCall().resolves(Result.ok([]));

      const result = await forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      expect(result.getError().message).to.be.eq(ForwardTransferError.reasons.FailedToCancelSenderTransfer);
      expect(result.getError().context).to.containSubset({
        cancellationError: "Sender transfer not in registry info",
        routingId: ctx.senderTransfer.meta.routingId,
        senderChannel: ctx.senderTransfer.channelAddress,
        senderTransfer: ctx.senderTransfer.transferId,
        cancellationReason: ForwardTransferError.reasons.ErrorForwardingTransfer,
        transferDefinition: ctx.senderTransfer.transferDefinition,
        registered: [],
      });
    });

    it("cancelling should fail if resolving transfer fails for non-timeout", async () => {
      const ctx = prepEnv();
      node.conditionalTransfer
        .onFirstCall()
        .resolves(Result.fail(new NodeError(NodeError.reasons.InternalServerError)));
      node.resolveTransfer.onFirstCall().resolves(Result.fail(new NodeError(NodeError.reasons.InternalServerError)));

      const result = await forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      expect(result.getError().message).to.be.eq(ForwardTransferError.reasons.FailedToCancelSenderTransfer);
      expect(result.getError().context).to.containSubset({
        resolveError: NodeError.reasons.InternalServerError,
        routingId: ctx.senderTransfer.meta.routingId,
        senderChannel: ctx.senderTransfer.channelAddress,
        senderTransfer: ctx.senderTransfer.transferId,
        cancellationReason: ForwardTransferError.reasons.ErrorForwardingTransfer,
      });
    });

    it("cancelling should be queued if resolving transfer fails due to timeout", async () => {
      const ctx = prepEnv();
      node.conditionalTransfer
        .onFirstCall()
        .resolves(Result.fail(new NodeError(NodeError.reasons.InternalServerError)));
      node.resolveTransfer.onFirstCall().resolves(Result.fail(new NodeError(NodeError.reasons.Timeout)));

      const result = await forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainProviders,
      );

      expect(result.getError().message).to.be.eq(ForwardTransferError.reasons.ErrorForwardingTransfer);
      expect(result.getError().context).to.containSubset({
        routingId: ctx.senderTransfer.meta.routingId,
        senderChannel: ctx.senderTransfer.channelAddress,
        senderTransfer: ctx.senderTransfer.transferId,
        details: "Sender transfer cancelled/queued",
      });

      expect(store.queueUpdate.callCount).to.be.eq(1);
    });
  });
});
