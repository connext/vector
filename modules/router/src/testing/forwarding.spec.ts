import Sinon from "sinon";

import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferType,
  FullChannelState,
  Result,
} from "@connext/vector-types";
import {
  mkAddress,
  getRandomBytes32,
  createTestFullLinkedTransferState,
  createTestChannelState,
} from "@connext/vector-utils";

import { IServerNodeService, RestServerNodeService } from "../services/server-node";
import { RouterStore } from "../services/store";
import { forwardTransferCreation } from "../forwarding";
import pino from "pino";
import { constants } from "ethers";

describe("Forwarding", () => {
  describe("transferCreation", () => {
    let node: Sinon.SinonStubbedInstance<RestServerNodeService>;
    let store: Sinon.SinonStubbedInstance<RouterStore>;
    const logger = pino({
      level: "info",
    });

    beforeEach(async () => {
      node = Sinon.createStubInstance(RestServerNodeService);
      store = Sinon.createStubInstance(RouterStore);
    });

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

    afterEach(() => {
      Sinon.restore();
      Sinon.reset();
    });

    it.only("successfully forwards a transfer creation with no swaps, no cross-chain and no collateralization", async () => {
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
