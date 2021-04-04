/* eslint-disable @typescript-eslint/no-empty-function */
import { VectorChainReader } from "@connext/vector-contracts";
import {
  ConditionalTransferCreatedPayload,
  FullChannelState,
  INodeService,
  Result,
  TransferNames,
  TRANSFER_DECREMENT,
  FullTransferState,
  UpdateType,
  Values,
  HashlockTransferStateEncoding,
  HashlockTransferResolverEncoding,
  ChainError,
  IVectorChainReader,
  IsAlivePayload,
  NodeParams,
  NodeError,
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
  ServerNodeServiceError,
} from "@connext/vector-utils";
import { AddressZero, HashZero } from "@ethersproject/constants";
import { BigNumber } from "@ethersproject/bignumber";
import Sinon from "sinon";
import { getAddress } from "@ethersproject/address";

import { IRouterStore, PrismaStore, RouterStoredUpdate, RouterUpdateStatus, RouterUpdateType } from "../services/store";
import * as forwarding from "../forwarding";
import * as config from "../config";
import * as configService from "../services/config";
import * as swapService from "../services/swap";
import * as transferService from "../services/transfer";
import { CheckInError, ForwardTransferCreationError } from "../errors";
import * as collateralService from "../services/collateral";

const testName = "Forwarding";

const realConfig = config.getEnvConfig();
const { log: logger } = getTestLoggers(testName, realConfig.logLevel as any);

type TransferCreatedTestContext = {
  senderTransfer: FullTransferState;
  senderChannel: FullChannelState;
  receiverChannel: FullChannelState;
  event: ConditionalTransferCreatedPayload;
};

describe(testName, () => {
  describe("forwardTransferCreation", () => {
    let node: Sinon.SinonStubbedInstance<RestServerNodeService>;
    let store: Sinon.SinonStubbedInstance<PrismaStore>;
    let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;
    let data: ConditionalTransferCreatedPayload;
    let senderChannel: FullChannelState;
    let receiverChannel: FullChannelState;
    let getSwappedAmount: Sinon.SinonStub;
    let cancelTransfer: Sinon.SinonStub;
    let justInTimeCollateral: Sinon.SinonStub;
    let getConfig: Sinon.SinonStub;
    let shouldChargeFees: Sinon.SinonStub;

    const routerPublicIdentifier = mkPublicIdentifier("vectorRRR");
    const aliceIdentifier = mkPublicIdentifier("vectorA");
    const bobIdentifier = mkPublicIdentifier("vectorB");
    const signerAddress = mkAddress("0xBBB");
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
        {
          meta: transferMeta,
          initiator: mkAddress("0xeee"),
          assetId: realConfig.allowedSwaps[0].fromAssetId,
          chainId: realConfig.allowedSwaps[0].fromChainId,
        },
      );

      const { channel: receiverChannel } = createTestChannelState(UpdateType.deposit, {
        aliceIdentifier: routerPublicIdentifier,
        bobIdentifier,
        alice: signerAddress,
      });

      const idx = senderChannel.assetIds.findIndex((a: any) => a === senderTransfer.assetId);

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

      const receiverTransferId = getRandomBytes32();
      // Set mock methods for default happy case
      // config
      getConfig.returns({
        ...realConfig,
        allowedSwaps: [
          {
            fromAssetId: ctx.event.transfer.assetId,
            fromChainId: ctx.event.transfer.chainId,
            hardcodedRate: "1",
            priceType: "hardcoded",
            toAssetId: ctx.event.transfer.meta?.path
              ? ctx.event.transfer.meta?.path[0]?.recipientAssetId ?? ctx.event.transfer.assetId
              : ctx.event.transfer.assetId,
            toChainId: ctx.event.transfer.meta?.path
              ? ctx.event.transfer.meta?.path[0]?.recipientChainId ?? ctx.event.transfer.chainId
              : ctx.event.transfer.chainId,
          },
        ],
      });
      shouldChargeFees.returns(Result.ok(false));
      // get sender channel
      node.getStateChannel.onFirstCall().resolves(Result.ok(senderChannel));
      // get swapped amount (optional)
      getSwappedAmount.returns(Result.ok(senderTransfer.balance.amount[0]));
      // get receiver channel
      node.getStateChannelByParticipants.onFirstCall().resolves(Result.ok(receiverChannel));
      // check online
      node.sendIsAliveMessage.resolves(Result.ok({ channelAddress: receiverChannel.channelAddress }));
      // request collateral (optional)
      justInTimeCollateral.resolves(Result.ok(undefined));
      cancelTransfer.resolves(Result.ok({ channelAddress: receiverChannel.channelAddress }));
      // create receiver transfer
      node.conditionalTransfer.onFirstCall().resolves(
        Result.ok({
          channelAddress: receiverChannel.channelAddress,
          transferId: receiverTransferId,
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
      result: Result<any, ForwardTransferCreationError>,
      ctx: TransferCreatedTestContext,
      swapCallCount = 0,
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
      expect(node.conditionalTransfer.callCount).to.be.eq(1);
      const { balance, ...details } = senderTransfer.transferState;
      const expected = {
        channelAddress: receiverChannel.channelAddress,
        amount:
          swapCallCount > 0 ? (await getSwappedAmount.returnValues[0]).getValue() : senderTransfer.balance.amount[0],
        assetId: senderTransfer.meta?.path[0]?.recipientAssetId ?? senderTransfer.assetId,
        timeout: BigNumber.from(senderTransfer.transferTimeout).sub(TRANSFER_DECREMENT).toString(),
        type: event.conditionType,
        publicIdentifier: routerPublicIdentifier,
        details,
        meta: {
          senderIdentifier: ctx.senderChannel.bobIdentifier,
          ...(senderTransfer.meta ?? {}),
        },
      };
      expect(node.conditionalTransfer.firstCall.args[0]).to.be.deep.eq(expected);
    };

    const verifyErrorResult = async (
      result: Result<any, ForwardTransferCreationError>,
      ctx: TransferCreatedTestContext,
      errorReason: Values<typeof ForwardTransferCreationError.reasons>,
      errorContext: any = {},
      senderCancelled = true,
      senderResolveFailed = false,
      sentSingleSigned = false,
    ) => {
      const error = result.getError()!;
      expect(error).to.be.ok;
      expect(result.isError).to.be.true;
      expect(error.message).to.be.eq(errorReason);

      if (!senderCancelled) {
        expect(error.context).to.containSubset({
          ...errorContext,
        });
        expect(store.queueUpdate.callCount).to.be.eq(sentSingleSigned ? 1 : 0);
        return;
      }
      expect(error.context).to.containSubset({
        senderTransfer: ctx.senderTransfer.transferId,
        senderChannel: ctx.senderTransfer.channelAddress,
        senderTransferCancellation: senderResolveFailed ? "queued" : "executed",
        ...errorContext,
      });
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

      cancelTransfer = Sinon.stub(transferService, "cancelCreatedTransfer");

      chainReader = Sinon.createStubInstance(VectorChainReader);

      justInTimeCollateral = Sinon.stub(collateralService, "justInTimeCollateral");

      getConfig = Sinon.stub(config, "getConfig");
      shouldChargeFees = Sinon.stub(configService, "shouldChargeFees");
    });

    afterEach(() => {
      Sinon.restore();
      Sinon.reset();
    });

    // Successful forwards
    it("successfully forwards a transfer creation with no swaps, no cross-chain no collateralization, no fees", async () => {
      const ctx = prepEnv();
      const result = await forwarding.forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader as IVectorChainReader,
      );

      await verifySuccessfulResult(result, ctx, 0);
    });

    it("successfully forwards a transfer creation with swaps, no cross-chain and no collateralization", async () => {
      const ctx = generateDefaultTestContext();
      ctx.receiverChannel.assetIds = [getAddress(mkAddress("0xfff"))];
      ctx.receiverChannel.balances = [ctx.receiverChannel.balances[0]];
      ctx.senderTransfer.meta.path[0].recipientAssetId = getAddress(mkAddress("0xfff"));
      const mocked = prepEnv({ ...ctx });

      const result = await forwarding.forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader as IVectorChainReader,
      );

      await verifySuccessfulResult(result, mocked, 1);
    });

    it("successfully forwards a transfer creation with no swaps, cross-chain and no collateralization", async () => {
      const ctx = generateDefaultTestContext();
      ctx.receiverChannel.networkContext.chainId = 1338;
      ctx.senderTransfer.meta.path[0].recipientChainId = 1338;
      const mocked = prepEnv({ ...ctx });

      const result = await forwarding.forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader as IVectorChainReader,
      );

      await verifySuccessfulResult(result, mocked, 1);
    });

    it("successfully forwards a transfer creation with swaps, cross-chain, and collateralization", async () => {
      const ctx = generateDefaultTestContext();
      ctx.receiverChannel.networkContext.chainId = 1338;
      ctx.senderTransfer.meta.path[0].recipientChainId = realConfig.allowedSwaps[0].toChainId;
      ctx.senderTransfer.meta.path[0].recipientAssetId = realConfig.allowedSwaps[0].toAssetId;
      const mocked = prepEnv({ ...ctx });

      const result = await forwarding.forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader as IVectorChainReader,
      );

      await verifySuccessfulResult(result, mocked, 1);
    });

    it.skip("fails but queues transfers if receiver offline and allowable offline", async () => {});

    // Uncancellable failures
    it("should fail without cancelling if no meta.routingId", async () => {
      const ctx = generateDefaultTestContext();
      ctx.senderTransfer.meta.routingId = undefined;
      const mocked = prepEnv({ ...ctx });

      const result = await forwarding.forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader as IVectorChainReader,
      );

      await verifyErrorResult(
        result,
        mocked,
        ForwardTransferCreationError.reasons.InvalidForwardingInfo,
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

      const result = await forwarding.forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader as IVectorChainReader,
      );

      await verifyErrorResult(
        result,
        mocked,
        ForwardTransferCreationError.reasons.InvalidForwardingInfo,
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

      const result = await forwarding.forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader as IVectorChainReader,
      );

      await verifyErrorResult(
        result,
        mocked,
        ForwardTransferCreationError.reasons.InvalidForwardingInfo,
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
      const err = (new ChainError(ChainError.reasons.TransferNotFound) as unknown) as ServerNodeServiceError;
      node.getStateChannel.onFirstCall().resolves(Result.fail(err));

      const result = await forwarding.forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader as IVectorChainReader,
      );

      const { stack, ...sanitized } = err.toJson();
      await verifyErrorResult(
        result,
        ctx,
        ForwardTransferCreationError.reasons.SenderChannelNotFound,
        {
          nodeError: sanitized,
        },
        false,
      );
    });

    it("should fail without cancelling if sender channel undefined", async () => {
      const ctx = prepEnv();
      node.getStateChannel.onFirstCall().resolves(Result.ok(undefined));

      const result = await forwarding.forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader as IVectorChainReader,
      );

      await verifyErrorResult(
        result,
        ctx,
        ForwardTransferCreationError.reasons.SenderChannelNotFound,
        {
          senderChannel: ctx.senderChannel.channelAddress,
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
      const err = new ChainError("fail");
      getSwappedAmount.returns(Result.fail(err));

      const result = await forwarding.forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader as IVectorChainReader,
      );

      const { stack, ...sanitized } = err.toJson();
      await verifyErrorResult(result, mocked, ForwardTransferCreationError.reasons.UnableToCalculateSwap, {
        swapError: sanitized,
      });
    });

    it("fails with cancellation if getting receiver channel fails", async () => {
      const ctx = prepEnv();
      const err = new ServerNodeServiceError(ServerNodeServiceError.reasons.InternalServerError, "", "", {});
      node.getStateChannelByParticipants.onFirstCall().resolves(Result.fail(err));

      const result = await forwarding.forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader as IVectorChainReader,
      );

      const { stack, ...sanitized } = err.toJson();
      await verifyErrorResult(result, ctx, ForwardTransferCreationError.reasons.RecipientChannelNotFound, {
        storeError: sanitized,
      });
    });

    it("fails with cancellation if no state channel available for receiver", async () => {
      const ctx = prepEnv();
      node.getStateChannelByParticipants.onFirstCall().resolves(Result.ok(undefined));

      const result = await forwarding.forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader as IVectorChainReader,
      );

      await verifyErrorResult(result, ctx, ForwardTransferCreationError.reasons.RecipientChannelNotFound, {
        participants: [routerPublicIdentifier, ctx.receiverChannel.bobIdentifier],
        chainId: ctx.receiverChannel.networkContext.chainId,
      });
    });

    it.skip("fails with cancellation if transferWithAutoCollateralization indicates sender-side should be cancelled", async () => {});

    it.skip("fails without cancellation if transferWithAutoCollateralization got receiver timeout", async () => {});

    it("fails without cancellation if transfer creation fails", async () => {
      const ctx = prepEnv();
      const err = new ServerNodeServiceError(ServerNodeServiceError.reasons.InternalServerError, "", "", {});
      node.conditionalTransfer.onFirstCall().resolves(Result.fail(err));

      const result = await forwarding.forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader as IVectorChainReader,
      );

      const { stack, ...sanitized } = err.toJson();
      await verifyErrorResult(
        result,
        ctx,
        ForwardTransferCreationError.reasons.ErrorForwardingTransfer,
        {
          transferError: sanitized,
        },
        false,
        undefined,
        true,
      );
    });
  });

  describe.skip("forwardTransferResolution", () => {
    it("should fail if it cannot find the transfers", async () => {});
    it("should fail if it cannot find incoming transfer", async () => {});
    it("should fail + queue update if resolveTransfer fails", async () => {});
    it("should work", async () => {});
  });

  describe("handleIsAlive", () => {
    // constants
    const channelAddress = mkAddress("0xccc");
    const aliceIdentifier = mkPublicIdentifier("vectorAAA");
    const bobIdentifier = mkPublicIdentifier("vectorBBB");
    const chainId = 1337;
    const skipCheckIn = undefined;
    const routerPublicIdentifier = mkPublicIdentifier("vectorRRR");
    const signerAddress = mkAddress("0xrrr");
    const defaultData = {
      channelAddress,
      aliceIdentifier,
      bobIdentifier,
      chainId,
      skipCheckIn,
    };

    // stubs
    let handlePendingUpdates: Sinon.SinonStub;
    let handleUnverifiedUpdates: Sinon.SinonStub;
    let handleRouterDroppedTransfers: Sinon.SinonStub;
    let nodeService: Sinon.SinonStubbedInstance<RestServerNodeService>;
    let store: Sinon.SinonStubbedInstance<PrismaStore>;
    let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;

    // Sets up mocks needed for test (all of the)
    const setupMocks = (data: Partial<IsAlivePayload> = {}): IsAlivePayload => {
      handlePendingUpdates.resolves(Result.ok(undefined));
      handleUnverifiedUpdates.resolves(Result.ok(undefined));
      handleRouterDroppedTransfers.resolves(Result.ok(undefined));

      const payload = {
        ...defaultData,
        ...data,
      };
      return payload;
    };

    beforeEach(async () => {
      // Generate mocks
      handlePendingUpdates = Sinon.stub(forwarding, "handlePendingUpdates");
      handleUnverifiedUpdates = Sinon.stub(forwarding, "handleUnverifiedUpdates");
      handleRouterDroppedTransfers = Sinon.stub(forwarding, "handleRouterDroppedTransfers");
      nodeService = Sinon.createStubInstance(RestServerNodeService);
      store = Sinon.createStubInstance(PrismaStore);
      chainReader = Sinon.createStubInstance(VectorChainReader);
    });

    afterEach(() => {
      Sinon.restore();
      Sinon.reset();
    });

    it("should fail if handlePendingUpdates fails", async () => {
      const payload = setupMocks();
      handlePendingUpdates.resolves(
        Result.fail(new CheckInError(CheckInError.reasons.UpdatesFailed, mkAddress("0xccc"))),
      );

      const result = await forwarding.handleIsAlive(
        payload,
        routerPublicIdentifier,
        signerAddress,
        nodeService as INodeService,
        store,
        chainReader as IVectorChainReader,
        logger,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(CheckInError.reasons.TasksFailed);
      expect(result.getError()?.context.unverified).to.be.undefined;
      expect(result.getError()?.context.pending.message).to.be.eq(CheckInError.reasons.UpdatesFailed);
    });

    it("should fail if handleUnverifiedUpdates fails", async () => {
      const payload = setupMocks();
      handleUnverifiedUpdates.resolves(
        Result.fail(new CheckInError(CheckInError.reasons.UpdatesFailed, mkAddress("0xccc"))),
      );

      const result = await forwarding.handleIsAlive(
        payload,
        routerPublicIdentifier,
        signerAddress,
        nodeService as INodeService,
        store,
        chainReader as IVectorChainReader,
        logger,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(CheckInError.reasons.TasksFailed);
      expect(result.getError()?.context.pending).to.be.undefined;
      expect(result.getError()?.context.unverified.message).to.be.eq(CheckInError.reasons.UpdatesFailed);
    });

    it("should fail if handleRouterDroppedTransfers fails", async () => {
      const payload = setupMocks();
      handleRouterDroppedTransfers.resolves(
        Result.fail(new CheckInError(CheckInError.reasons.UpdatesFailed, mkAddress("0xccc"))),
      );

      const result = await forwarding.handleIsAlive(
        payload,
        routerPublicIdentifier,
        signerAddress,
        nodeService as INodeService,
        store,
        chainReader as IVectorChainReader,
        logger,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(CheckInError.reasons.UpdatesFailed);
    });

    it("should do nothing if skipCheckIn flag included", async () => {
      const payload = setupMocks({ skipCheckIn: true });
      const result = await forwarding.handleIsAlive(
        payload,
        routerPublicIdentifier,
        signerAddress,
        nodeService as INodeService,
        store,
        chainReader as IVectorChainReader,
        logger,
      );
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.undefined;
      expect(handleRouterDroppedTransfers.callCount).to.be.eq(0);
      expect(handleUnverifiedUpdates.callCount).to.be.eq(0);
      expect(handlePendingUpdates.callCount).to.be.eq(0);
    });

    it("should work", async () => {
      const payload = setupMocks();

      const result = await forwarding.handleIsAlive(
        payload,
        routerPublicIdentifier,
        signerAddress,
        nodeService as INodeService,
        store,
        chainReader as IVectorChainReader,
        logger,
      );
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.undefined;
      expect(handleRouterDroppedTransfers.callCount).to.be.eq(1);
      expect(handleUnverifiedUpdates.callCount).to.be.eq(1);
      expect(handlePendingUpdates.callCount).to.be.eq(1);
    });
  });

  describe("handlePendingUpdates", () => {
    // constants
    const channelAddress = mkAddress("0xccc");
    const aliceIdentifier = mkPublicIdentifier("vectorAAA");
    const bobIdentifier = mkPublicIdentifier("vectorBBB");
    const chainId = 1337;
    const skipCheckIn = undefined;
    const routerPublicIdentifier = aliceIdentifier;
    const signerAddress = mkAddress("0xrrr");
    const defaultData = {
      channelAddress,
      aliceIdentifier,
      bobIdentifier,
      chainId,
      skipCheckIn,
    };

    // stubs
    let nodeService: Sinon.SinonStubbedInstance<RestServerNodeService>;
    let store: Sinon.SinonStubbedInstance<PrismaStore>;
    let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;
    let transferWithCollateralization: Sinon.SinonStub;

    const setupMocks = (
      updateParams: Partial<NodeParams.ConditionalTransfer | NodeParams.ResolveTransfer> &
        { type: RouterUpdateType }[] = [],
      data: Partial<IsAlivePayload> = {},
    ) => {
      // Generate channel that matches payload
      const { channel } = createTestChannelState(UpdateType.deposit, {
        channelAddress: data.channelAddress ?? channelAddress,
        aliceIdentifier: data.aliceIdentifier ?? aliceIdentifier,
        bobIdentifier: data.bobIdentifier ?? bobIdentifier,
        alice: signerAddress,
        networkContext: {
          chainId: data.chainId ?? chainId,
        },
      });
      const payload = {
        ...defaultData,
        ...data,
      };

      // Set default to have once create update
      const storedUpdates = updateParams.map((params) => {
        const { type, ...overloads } = params;
        const defaults =
          type === RouterUpdateType.TRANSFER_CREATION
            ? {
                channelAddress: channel.channelAddress,
                publicIdentifier: channel.aliceIdentifier,
                amount: "1000",
                assetId: mkAddress(),
                type: TransferNames.HashlockTransfer,
                details: { lockHash: getRandomBytes32() },
              }
            : {
                transferId: getRandomBytes32(),
                transferResolver: { preImage: getRandomBytes32() },
                channelAddress: channel.channelAddress,
                publicIdentifier: channel.aliceIdentifier,
              };
        const val: RouterStoredUpdate<typeof type> = {
          id: getRandomBytes32(),
          type,
          status: RouterUpdateStatus.PENDING,
          payload: {
            ...defaults,
            ...overloads,
          },
        };
        return val;
      });

      // Set default mocked values
      store.getQueuedUpdates.resolves(storedUpdates);
      nodeService.getStateChannel.resolves(Result.ok(channel));
      // NOTE: return value in Result from `transferWithCollateralization`
      // and `nodeService.resolveTransfer` are not used. Error context is
      // the only thing if failing (set in tests themselves)
      transferWithCollateralization.resolves(Result.ok("Yay you did it"));
      nodeService.resolveTransfer.resolves(
        Result.ok({
          channelAddress: channel.channelAddress,
          transferId: getRandomBytes32(),
          routingId: getRandomBytes32(),
        }),
      );
      return { channel, storedUpdates, payload };
    };

    beforeEach(async () => {
      // Generate mocks
      nodeService = Sinon.createStubInstance(RestServerNodeService);
      store = Sinon.createStubInstance(PrismaStore);
      chainReader = Sinon.createStubInstance(VectorChainReader);
      transferWithCollateralization = Sinon.stub(transferService, "transferWithCollateralization");
    });

    afterEach(() => {
      Sinon.restore();
      Sinon.reset();
    });

    it("should fail if store.getQueuedUpdates fails", async () => {
      const { payload } = setupMocks();
      store.getQueuedUpdates.rejects(new Error("fail"));
      await expect(
        forwarding.handlePendingUpdates(
          payload,
          routerPublicIdentifier,
          nodeService as INodeService,
          store,
          chainReader as IVectorChainReader,
          logger,
        ),
      ).rejectedWith("fail");
    });

    it("should fail if nodeService.getStateChannel fails", async () => {
      const { payload } = setupMocks();
      nodeService.getStateChannel.resolves(
        Result.fail(new ServerNodeServiceError(ServerNodeServiceError.reasons.InternalServerError, "", "", {})),
      );
      const result = await forwarding.handlePendingUpdates(
        payload,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader as IVectorChainReader,
        logger,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(CheckInError.reasons.CouldNotGetChannel);
    });

    it("should fail if there is no channel in the store", async () => {
      const { payload } = setupMocks();
      nodeService.getStateChannel.resolves(Result.ok(undefined));
      const result = await forwarding.handlePendingUpdates(
        payload,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader as IVectorChainReader,
        logger,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(CheckInError.reasons.CouldNotGetChannel);
    });

    it("should fail if store.setUpdateStatus fails", async () => {
      const { payload } = setupMocks([{ type: RouterUpdateType.TRANSFER_RESOLUTION }]);
      store.setUpdateStatus.rejects(new Error("fail"));
      await expect(
        forwarding.handlePendingUpdates(
          payload,
          routerPublicIdentifier,
          nodeService as INodeService,
          store,
          chainReader as IVectorChainReader,
          logger,
        ),
      ).rejectedWith("fail");
    });

    it("should handle a failed transfer creation", async () => {
      const { payload, storedUpdates } = setupMocks([{ type: RouterUpdateType.TRANSFER_CREATION }]);
      transferWithCollateralization.resolves(Result.fail(new ChainError("fail", { transferError: "fail" })));
      const result = await forwarding.handlePendingUpdates(
        payload,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader as IVectorChainReader,
        logger,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(CheckInError.reasons.UpdatesFailed);
      expect(store.setUpdateStatus.callCount).to.be.eq(2);
      expect(store.setUpdateStatus.getCall(1).args).to.containSubset([storedUpdates[0].id, RouterUpdateStatus.FAILED]);
    });

    it("should handle a failed transfer resolution", async () => {
      const { payload, storedUpdates } = setupMocks([{ type: RouterUpdateType.TRANSFER_RESOLUTION }]);
      nodeService.resolveTransfer.resolves(Result.fail(new ChainError("fail", { transferError: "fail" }) as any));
      const result = await forwarding.handlePendingUpdates(
        payload,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader as IVectorChainReader,
        logger,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(CheckInError.reasons.UpdatesFailed);
      expect(nodeService.resolveTransfer.calledOnceWithExactly(storedUpdates[0].payload as any)).to.be.true;
      expect(store.setUpdateStatus.callCount).to.be.eq(2);
      expect(store.setUpdateStatus.getCall(1).args).to.containSubset([storedUpdates[0].id, RouterUpdateStatus.FAILED]);
    });

    it("should handle an unknown update type", async () => {
      const { payload, storedUpdates } = setupMocks([{ type: RouterUpdateType.TRANSFER_RESOLUTION }]);
      store.getQueuedUpdates.resolves([{ ...storedUpdates[0], type: "unknown" as any }]);
      const result = await forwarding.handlePendingUpdates(
        payload,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader as IVectorChainReader,
        logger,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(CheckInError.reasons.UpdatesFailed);
      expect(store.setUpdateStatus.callCount).to.be.eq(2);
      expect(store.setUpdateStatus.getCall(1).args).to.containSubset([storedUpdates[0].id, RouterUpdateStatus.FAILED]);
    });

    it("should handle timeout errors and keep as pending for creation + resolution updates", async () => {
      const { payload, storedUpdates } = setupMocks([{ type: RouterUpdateType.TRANSFER_RESOLUTION }]);
      nodeService.resolveTransfer.resolves(Result.fail(new ChainError(ServerNodeServiceError.reasons.Timeout) as any));
      const result = await forwarding.handlePendingUpdates(
        payload,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader as IVectorChainReader,
        logger,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(CheckInError.reasons.UpdatesFailed);
      expect(store.setUpdateStatus.callCount).to.be.eq(2);
      expect(store.setUpdateStatus.getCall(1).args).to.containSubset([storedUpdates[0].id, RouterUpdateStatus.PENDING]);
    });

    it("should handle an array of pending updates, marking as succeeded and failed", async () => {
      const { payload, storedUpdates } = setupMocks([
        { type: RouterUpdateType.TRANSFER_RESOLUTION },
        { type: RouterUpdateType.TRANSFER_CREATION },
        { type: RouterUpdateType.TRANSFER_RESOLUTION },
      ]);
      transferWithCollateralization.resolves(Result.fail(new ChainError("fail", { transferError: "fail" }) as any));
      const result = await forwarding.handlePendingUpdates(
        payload,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader as IVectorChainReader,
        logger,
      );
      expect(result.isError).to.be.true;
      expect(result.getError()?.message).to.be.eq(CheckInError.reasons.UpdatesFailed);
      expect(store.setUpdateStatus.callCount).to.be.eq(6);
      expect(store.setUpdateStatus.getCall(1).args).to.containSubset([
        storedUpdates[0].id,
        RouterUpdateStatus.COMPLETE,
      ]);
      expect(store.setUpdateStatus.getCall(3).args).to.containSubset([storedUpdates[1].id, RouterUpdateStatus.FAILED]);
      expect(store.setUpdateStatus.getCall(5).args).to.containSubset([
        storedUpdates[2].id,
        RouterUpdateStatus.COMPLETE,
      ]);
    });

    it("should handle an array of all successful updates", async () => {
      const { payload, storedUpdates } = setupMocks([
        { type: RouterUpdateType.TRANSFER_RESOLUTION },
        { type: RouterUpdateType.TRANSFER_CREATION },
        { type: RouterUpdateType.TRANSFER_RESOLUTION },
      ]);
      const result = await forwarding.handlePendingUpdates(
        payload,
        routerPublicIdentifier,
        nodeService as INodeService,
        store,
        chainReader as IVectorChainReader,
        logger,
      );
      expect(result.isError).to.be.false;
      expect(result.getValue()).to.be.undefined;
      expect(store.setUpdateStatus.callCount).to.be.eq(6);
      expect(store.setUpdateStatus.getCall(1).args).to.containSubset([
        storedUpdates[0].id,
        RouterUpdateStatus.COMPLETE,
      ]);
      expect(store.setUpdateStatus.getCall(3).args).to.containSubset([
        storedUpdates[1].id,
        RouterUpdateStatus.COMPLETE,
      ]);
      expect(store.setUpdateStatus.getCall(5).args).to.containSubset([
        storedUpdates[2].id,
        RouterUpdateStatus.COMPLETE,
      ]);
    });
  });
});
