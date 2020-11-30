/* eslint-disable @typescript-eslint/no-empty-function */
import { ConditionalTransferCreatedPayload, INodeService, Result, TransferNames } from "@connext/vector-types";
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

describe("Forwarding", () => {
  describe("transferCreation", () => {
    const logger = pino({ level: config.logLevel });
    let node: Sinon.SinonStubbedInstance<RestServerNodeService>;
    let store: Sinon.SinonStubbedInstance<RouterStore>;

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
      };
    };

    beforeEach(async () => {
      node = Sinon.createStubInstance(RestServerNodeService, {
        sendDepositTx: Promise.resolve(Result.ok({ txHash: getRandomBytes32() })),
      });
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
      });
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
      });
      node.getStateChannel.resolves(Result.ok(senderChannel));
      node.getStateChannelByParticipants.resolves(Result.ok(receiverChannel));
      node.conditionalTransfer.resolves(Result.ok({} as any));
      node.sendDepositTx.resolves(Result.ok({ txHash: getRandomBytes32() }));
      node.reconcileDeposit.resolves(Result.ok({ channelAddress: data.channelAddress }));
      await expect(
        forwardTransferCreation(
          data,
          mkPublicIdentifier("vectorBBB"),
          mkAddress("0xb"),
          node as INodeService,
          store,
          logger,
          hydratedProviders,
        ),
      ).to.eventually.be.ok;
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
    it.skip("queues update successfully if transfer creation fails with timeout and transfer is allowOffline", async () => {});
    it.skip("fails if transfer creation fails for any other reason than a timeout", async () => {});
  });
});
