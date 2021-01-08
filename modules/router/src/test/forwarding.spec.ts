/* eslint-disable @typescript-eslint/no-empty-function */
import { VectorChainReader } from "@connext/vector-contracts";
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
  ChainError,
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

import { PrismaStore } from "../services/store";
import { forwardTransferCreation } from "../forwarding";
import { config } from "../config";
import * as swapService from "../services/swap";
import * as transferService from "../services/transfer";
import { ForwardTransferCreationError } from "../errors";
import * as collateralService from "../services/collateral";

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
    let chainReader: Sinon.SinonStubbedInstance<VectorChainReader>;
    let data: ConditionalTransferCreatedPayload;
    let senderChannel: FullChannelState;
    let receiverChannel: FullChannelState;
    let getSwappedAmount: Sinon.SinonStub;
    let cancelTransfer: Sinon.SinonStub;
    let justInTimeCollateral: Sinon.SinonStub;

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

      const receiverTransferId = getRandomBytes32();
      // Set mock methods for default happy case
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
      result: Result<any, ForwardTransferCreationError>,
      ctx: TransferCreatedTestContext,
      errorReason: Values<typeof ForwardTransferCreationError.reasons>,
      attemptedTransfer: boolean,
      errorContext: any = {},
      senderCancelled = true,
      senderResolveFailed = false,
    ) => {
      const error = result.getError();
      expect(error).to.be.ok;
      expect(result.isError).to.be.true;
      expect(error.message).to.be.eq(errorReason);

      if (!senderCancelled) {
        expect(error.context).to.containSubset({
          ...errorContext,
        });
        expect(store.queueUpdate.callCount).to.be.eq(0);
        return;
      }
      expect(error.context).to.containSubset({
        senderTransfer: ctx.senderTransfer.transferId,
        channelAddress: ctx.senderTransfer.channelAddress,
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
        chainReader,
      );

      await verifySuccessfulResult(result, ctx, 0);
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
        chainReader,
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
        chainReader,
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
        chainReader,
      );

      await verifySuccessfulResult(result, mocked, 1);
    });

    // TODO: implement offline payments
    it.skip("fails but queues transfers if receiver offline and allowable offline", async () => {});

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
        chainReader,
      );

      await verifyErrorResult(
        result,
        mocked,
        ForwardTransferCreationError.reasons.InvalidForwardingInfo,
        false,
        {
          meta: mocked.senderTransfer.meta,
          senderTransfer: mocked.senderTransfer.transferId,
          channelAddress: mocked.senderTransfer.channelAddress,
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
        chainReader,
      );

      await verifyErrorResult(
        result,
        mocked,
        ForwardTransferCreationError.reasons.InvalidForwardingInfo,
        false,
        {
          meta: mocked.senderTransfer.meta,
          senderTransfer: mocked.senderTransfer.transferId,
          channelAddress: mocked.senderTransfer.channelAddress,
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
        chainReader,
      );

      await verifyErrorResult(
        result,
        mocked,
        ForwardTransferCreationError.reasons.InvalidForwardingInfo,
        false,
        {
          meta: mocked.senderTransfer.meta,
          senderTransfer: mocked.senderTransfer.transferId,
          channelAddress: mocked.senderTransfer.channelAddress,
        },
        false,
      );
    });

    it("should fail without cancelling if cannot get sender channel from store", async () => {
      const ctx = prepEnv();
      const err = (new ChainError(ChainError.reasons.TransferNotFound) as unknown) as ServerNodeServiceError;
      node.getStateChannel.onFirstCall().resolves(Result.fail(err));

      const result = await forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader,
      );

      const { stack, ...sanitized } = err.toJson();
      await verifyErrorResult(
        result,
        ctx,
        ForwardTransferCreationError.reasons.SenderChannelNotFound,
        false,
        {
          nodeError: sanitized,
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
        chainReader,
      );

      await verifyErrorResult(
        result,
        ctx,
        ForwardTransferCreationError.reasons.SenderChannelNotFound,
        false,
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
      const err = new ChainError("fail");
      getSwappedAmount.returns(Result.fail(err));

      const result = await forwardTransferCreation(
        mocked.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader,
      );

      const { stack, ...sanitized } = err.toJson();
      await verifyErrorResult(result, mocked, ForwardTransferCreationError.reasons.UnableToCalculateSwap, false, {
        swapError: sanitized,
      });
    });

    it("fails with cancellation if getting receiver channel fails", async () => {
      const ctx = prepEnv();
      const err = new ServerNodeServiceError(ServerNodeServiceError.reasons.InternalServerError, "", "", {});
      node.getStateChannelByParticipants.onFirstCall().resolves(Result.fail(err));

      const result = await forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader,
      );

      const { stack, ...sanitized } = err.toJson();
      await verifyErrorResult(result, ctx, ForwardTransferCreationError.reasons.RecipientChannelNotFound, false, {
        storeError: sanitized,
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
        chainReader,
      );

      await verifyErrorResult(result, ctx, ForwardTransferCreationError.reasons.RecipientChannelNotFound, false, {
        participants: [routerPublicIdentifier, ctx.receiverChannel.bobIdentifier],
        chainId: ctx.receiverChannel.networkContext.chainId,
      });
    });

    it.skip("fails with cancellation if transferWithAutoCollateralization indicates sender-side should be cancelled", async () => {});

    it.skip("fails without cancellation if transferWithAutoCollateralization got receiver timeout", async () => {});

    // TODO: the code indicates that sender should not be cancelled, verify this with Layne
    it.skip("fails with cancellation if transfer creation fails", async () => {
      const ctx = prepEnv();
      const err = new ServerNodeServiceError(ServerNodeServiceError.reasons.InternalServerError, "", "", {});
      node.conditionalTransfer.onFirstCall().resolves(Result.fail(err));

      const result = await forwardTransferCreation(
        ctx.event,
        routerPublicIdentifier,
        signerAddress,
        node as INodeService,
        store,
        testLog,
        chainReader,
      );

      const { stack, ...sanitized } = err.toJson();
      await verifyErrorResult(result, ctx, ForwardTransferCreationError.reasons.ErrorForwardingTransfer, false, {
        createError: sanitized,
      });
    });
  });

  describe.skip("forwardTransferResolution", () => {
    it("should fail if it cannot find the transfers", async () => {});
    it("should fail if it cannot find incoming transfer", async () => {});
    it("should fail + queue update if resolveTransfer fails", async () => {});
    it("should work", async () => {});
  });

  describe.skip("handleIsAlive", () => {});
});
