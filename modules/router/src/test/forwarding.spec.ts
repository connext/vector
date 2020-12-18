/* eslint-disable @typescript-eslint/no-empty-function */
import {
  ConditionalTransferCreatedPayload,
  INodeService,
  Result,
  TransferNames,
  FullChannelState,
  FullTransferState,
  UpdateType,
  TRANSFER_DECREMENT,
} from "@connext/vector-types";
import {
  createTestChannelState,
  expect,
  getRandomBytes32,
  mkAddress,
  mkPublicIdentifier,
  RestServerNodeService,
  getTestLoggers,
} from "@connext/vector-utils";
import { BigNumber } from "@ethersproject/bignumber";
import Sinon from "sinon";

import { RouterStore } from "../services/store";
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

describe.only("Forwarding", () => {
  describe("forwardTransferCreation", () => {
    let node: Sinon.SinonStubbedInstance<RestServerNodeService>;
    let store: Sinon.SinonStubbedInstance<RouterStore>;
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
        { aliceIdentifier: routerPublicIdentifier, bobIdentifier: aliceIdentifier, alice: signerAddress },
        { meta: transferMeta },
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
      expect(
        node.conditionalTransfer.calledOnceWithExactly({
          channelAddress: receiverChannel.channelAddress,
          amount:
            swapCallCount > 0 ? (await getSwappedAmount.returnValues[0]).getValue() : senderTransfer.balance.amount[0],
          assetId: senderTransfer.meta.path.recipientAssetId ?? senderTransfer.assetId,
          timeout: BigNumber.from(senderTransfer.transferTimeout).sub(TRANSFER_DECREMENT).toString(),
          type: event.conditionType,
          publicIdentifier: routerPublicIdentifier,
          details: { ...senderTransfer.transferState },
          meta: {
            ...(senderTransfer.meta ?? {}),
          },
        }),
      );
    };

    beforeEach(async () => {
      // Declare stubs
      node = Sinon.createStubInstance(RestServerNodeService, {
        sendDepositTx: Promise.resolve(Result.ok({ txHash: getRandomBytes32() })),
      });
      store = Sinon.createStubInstance(RouterStore);
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

    it.skip("successfully queues transfers if allowable offline && creation failed because receiver was offline", async () => {});

    // Uncancellable failures
    it.skip("should fail without cancelling if no meta.routingId", async () => {});
    it.skip("should fail without cancelling if no meta.path", async () => {});
    it.skip("should fail without cancelling if no meta.path.recipientIdentifier", async () => {});
    it.skip("should fail without cancelling if cannot get sender channel from store", async () => {});
    it.skip("should fail without cancelling if sender channel undefined", async () => {});

    // Cancellable failures
    it.skip("fails with cancellation if swapping amount fails", async () => {});
    it.skip("fails with cancellation if no state channel available for receiver", async () => {});
    it.skip("fails with cancellation if no rebalance profile available", async () => {});
    it.skip("fails with cancellation if depositing (collateralizing) fails", async () => {});
    it.skip("fails with cancellation if transfer creation fails for any other reason than a timeout", async () => {});
  });
});
