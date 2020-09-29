/* eslint-disable @typescript-eslint/no-empty-function */
import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferType,
  Result,
} from "@connext/vector-types";
import {
  createTestChannelState,
  createTestFullLinkedTransferState,
  getRandomBytes32,
  IServerNodeService,
  mkAddress,
  RestServerNodeService,
} from "@connext/vector-utils";
import { constants } from "ethers";
import pino from "pino";
import Sinon from "sinon";

import { RouterStore } from "../services/store";
import { forwardTransferCreation } from "../forwarding";

describe("Forwarding", () => {
  describe("transferCreation", () => {
    const logger = pino({ level: "info" });
    let node: Sinon.SinonStubbedInstance<RestServerNodeService>;
    let store: Sinon.SinonStubbedInstance<RouterStore>;

    const generateTransferData = (): ConditionalTransferCreatedPayload => {
      const channelAddress = mkAddress("0x1");
      const routingId = getRandomBytes32();
      const channelBalance = {
        amount: ["5", "7"],
        to: [mkAddress("0xa"), mkAddress("0xb")],
      };
      const transfer = createTestFullLinkedTransferState({
        channelAddress,
        initialBalance: {
          amount: ["2", "0"],
          to: channelBalance.to,
        },
        assetId: mkAddress("0x0"),
        meta: { routingId, path: [channelAddress] },
      });
      const conditionType = ConditionalTransferType.LinkedTransfer;
      return {
        channelAddress,
        routingId,
        transfer,
        channelBalance,
        conditionType,
      };
    };

    beforeEach(async () => {
      node = Sinon.createStubInstance(RestServerNodeService);
      store = Sinon.createStubInstance(RouterStore);
    });

    afterEach(() => {
      Sinon.restore();
      Sinon.reset();
    });

    it("successfully forwards a transfer creation with no swaps, no cross-chain and no collateralization", async () => {
      const data = generateTransferData();
      const senderChannel = createTestChannelState("create", {
        channelAddress: data.channelAddress,
        balances: [data.channelBalance],
      });
      const receiverChannel = createTestChannelState("deposit", {
        participants: [mkAddress("0xb"), mkAddress("0xc")],
        assetIds: [constants.AddressZero],
        balances: [
          {
            amount: ["5", "7"],
            to: [mkAddress("0xb"), mkAddress("0xc")],
          },
        ],
      });
      node["getStateChannel"].resolves(Result.ok(senderChannel));
      node["getStateChannelByParticipants"].resolves(Result.ok(receiverChannel));
      node["signerAddress"] = mkAddress("0xb");
      node["conditionalTransfer"].resolves(Result.ok({} as any));
      await forwardTransferCreation(data, node as IServerNodeService, store, logger);
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
