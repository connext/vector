/* eslint-disable @typescript-eslint/no-empty-function */
import {
  ConditionalTransferCreatedPayload,
  FullChannelState,
  INodeService,
  NodeError,
  Result,
  TransferNames,
} from "@connext/vector-types";
import {
  createTestChannelState,
  createTestFullHashlockTransferState,
  expect,
  getRandomBytes32,
  mkAddress,
  mkPublicIdentifier,
  RestServerNodeService,
} from "@connext/vector-utils";
import { AddressZero } from "@ethersproject/constants";
import pino from "pino";
import Sinon from "sinon";

import { RouterStore } from "../services/store";
import { forwardTransferCreation } from "../forwarding";
import { config } from "../config";

import { mockProvider } from "./utils/mocks";

const hydratedProviders = { 1337: mockProvider };

const logger = pino({ level: config.logLevel });

describe("Forwarding", () => {
  describe("transferCreation", () => {
    let node: Sinon.SinonStubbedInstance<RestServerNodeService>;
    let store: Sinon.SinonStubbedInstance<RouterStore>;
    let data: ConditionalTransferCreatedPayload;
    let senderChannel: FullChannelState;
    let receiverChannel: FullChannelState;

    const generateTransferData = (): ConditionalTransferCreatedPayload => {
      const channelAddress = mkAddress("0x1");
      const routingId = getRandomBytes32();
      const channelBalance = {
        amount: ["5", "7"],
        to: [mkAddress("0xa"), mkAddress("0xb")],
      };
      const transfer = createTestFullHashlockTransferState({
        channelAddress,
        balance: {
          amount: ["2", "0"],
          to: channelBalance.to,
        },
        assetId: mkAddress("0x0"),
        meta: { routingId, path: [channelAddress] },
      });
      const conditionType = TransferNames.HashlockTransfer;
      return {
        channelAddress,
        transfer,
        channelBalance,
        conditionType,
        aliceIdentifier: mkPublicIdentifier("vectorA"),
        bobIdentifier: mkPublicIdentifier("vectorB"),
      };
    };

    beforeEach(async () => {
      data = generateTransferData();
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

      node = Sinon.createStubInstance(RestServerNodeService, {
        sendDepositTx: Promise.resolve(Result.ok({ txHash: getRandomBytes32() })),
      });
      node.getStateChannel.resolves(Result.ok(senderChannel));
      node.getStateChannelByParticipants.resolves(Result.ok(receiverChannel));
      node.conditionalTransfer.resolves(Result.ok({} as any));
      node.sendDepositTx.resolves(Result.ok({ txHash: getRandomBytes32() }));
      node.reconcileDeposit.resolves(Result.ok({ channelAddress: data.channelAddress }));
      store = Sinon.createStubInstance(RouterStore);
    });

    afterEach(() => {
      Sinon.restore();
      Sinon.reset();
    });

    it("successfully forwards a transfer creation with no swaps, no cross-chain and no collateralization", async () => {
      const data = generateTransferData();
      const senderChannel = createTestChannelState("create", {
        alice: mkAddress("0xa"),
        bob: mkAddress("0xb1"),
        channelAddress: data.channelAddress,
        balances: [data.channelBalance],
      }).channel;
      const receiverChannel = createTestChannelState("deposit", {
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
      node.getStateChannel.resolves(Result.ok(senderChannel));
      node.getStateChannelByParticipants.resolves(Result.ok(receiverChannel));
      node.conditionalTransfer.resolves(Result.ok({} as any));
      node.sendDepositTx.resolves(Result.ok({ txHash: getRandomBytes32() }));
      node.reconcileDeposit.resolves(Result.ok({ channelAddress: data.channelAddress }));
      const forwarded = await forwardTransferCreation(
        data,
        mkPublicIdentifier("vectorBBB"),
        mkAddress("0xb"),
        node as INodeService,
        store,
        logger,
        hydratedProviders,
      );
      expect(forwarded.getError()).to.be.undefined;
    });

    it.only("queues update successfully if transfer creation fails with timeout and transfer is allowOffline", async () => {
      node.conditionalTransfer.resolves(Result.fail(new NodeError(NodeError.reasons.Timeout)));
      await forwardTransferCreation(
        data,
        mkPublicIdentifier("vectorBBB"),
        mkAddress("0xb"),
        node as INodeService,
        store,
        logger,
        hydratedProviders,
      );

      expect(
        store.queueUpdate.calledWith("TransferCreation", {
          channelAddress: receiverChannel.channelAddress,
          amount: data.transfer.balance.amount[0],
          assetId: data.transfer.assetId,
          routingId: data.transfer.meta.routingId,
          type: "HashlockTransfer",
          details: data.transfer.transferState,
        }),
      ).to.be.true;
    });

    it.skip("successfully forwards a transfer creation with swaps, no cross-chain and no collateralization", async () => {});
    it.skip("successfully forwards a transfer creation with no swaps, cross-chain and no collateralization", async () => {});
    it.skip("successfully forwards a transfer creation with swaps, cross-chain, and collateralization", async () => {});
    it.skip("fails if no state channel available for sender", async () => {});
    it.skip("fails if no swapping amount fails", async () => {});
    it.skip("fails if no state channel available for receiver", async () => {});
    it.skip("fails if no rebalance profile available", async () => {});
    it.skip("fails if depositing (collateralizing) fails", async () => {});
    it.skip("fails if transfer creation fails with timeout and transfer is requireOnline", async () => {});
    it.skip("fails if transfer creation fails for any other reason than a timeout", async () => {});
  });
});
