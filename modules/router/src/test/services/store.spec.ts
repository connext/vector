import { AllowedSwap, DEFAULT_TRANSFER_TIMEOUT, NodeParams, TransferNames } from "@connext/vector-types";
import { delay, expect, getRandomBytes32, mkAddress, mkPublicIdentifier } from "@connext/vector-utils";
import { AddressZero } from "@ethersproject/constants";
import { v4 as uuidv4 } from "uuid";

import { PrismaStore, RouterRebalanceStatus, RouterUpdateStatus, RouterUpdateType } from "../../services/store";
import { getConfig } from "../../config";

const config = getConfig();

describe("Router store", () => {
  let store: PrismaStore;
  const channelAddress = mkAddress("0xccc");
  const publicIdentifier = mkPublicIdentifier("vectorSSSS");

  before(() => {
    store = new PrismaStore(config.dbUrl);
  });

  afterEach(async () => {
    await store.clear();
  });

  after(async () => {
    await store.disconnect();
  });

  const generateTransferCreatedPayload = (
    overrides: Partial<NodeParams.ConditionalTransfer> = {},
  ): NodeParams.ConditionalTransfer => {
    return {
      recipient: mkPublicIdentifier("vectorRRRR"),
      recipientAssetId: mkAddress("0xaaa"),
      recipientChainId: 1338,
      channelAddress,
      amount: "1139467",
      assetId: mkAddress(),
      type: TransferNames.HashlockTransfer,
      details: { lockHash: getRandomBytes32(), expiry: "0" },
      timeout: DEFAULT_TRANSFER_TIMEOUT.toString(),
      publicIdentifier,
      meta: { hello: "world" },
      ...overrides,
    };
  };

  const generateTransferResolvedPayload = (
    overrides: Partial<NodeParams.ResolveTransfer> = {},
  ): NodeParams.ResolveTransfer => {
    return {
      channelAddress,
      transferId: getRandomBytes32(),
      transferResolver: { preImage: getRandomBytes32() },
      publicIdentifier,
      ...overrides,
    };
  };

  it("getQueuedUpdates / queueUpdate / setUpdateStatus should work", async () => {
    const toQueue = Array(5)
      .fill(0)
      .map((_, idx) => {
        return {
          updateData: idx % 2 === 0 ? generateTransferCreatedPayload() : generateTransferResolvedPayload(),
          type: idx % 2 === 0 ? RouterUpdateType.TRANSFER_CREATION : RouterUpdateType.TRANSFER_RESOLUTION,
        };
      });

    // queue pending updates
    await Promise.all(toQueue.map((entry) => store.queueUpdate(channelAddress, entry.type, entry.updateData)));

    // verify
    const pending = await store.getQueuedUpdates(channelAddress, [RouterUpdateStatus.PENDING]);
    expect(pending.length).to.be.eq(toQueue.length);
    pending.map((s) => {
      const expected = toQueue.find((t) => {
        if (s.type === RouterUpdateType.TRANSFER_RESOLUTION) {
          return (
            t.type === RouterUpdateType.TRANSFER_RESOLUTION &&
            (s.payload as NodeParams.ResolveTransfer).transferId ===
              (t.updateData as NodeParams.ResolveTransfer).transferId
          );
        }
        return (
          t.type === RouterUpdateType.TRANSFER_CREATION &&
          (s.payload as NodeParams.ConditionalTransfer).details.lockHash ===
            (t.updateData as NodeParams.ConditionalTransfer).details.lockHash
        );
      });
      expect(expected).to.be.ok;
      expect(s.type).to.be.eq(expected!.type);
      expect(s.status).to.be.eq(RouterUpdateStatus.PENDING);
      expect(s.payload).to.be.deep.eq(expected!.updateData);
      expect(s.id).to.be.ok;
    });

    // test other statuses
    for (const status of [RouterUpdateStatus.COMPLETE, RouterUpdateStatus.FAILED]) {
      await store.setUpdateStatus(pending[0].id, status);
      const updated = await store.getQueuedUpdates(channelAddress, [status]);
      expect(updated).to.be.deep.eq([{ ...pending[0], status }]);
    }
  });

  it("saveRebalance / getLatestRebalance should work", async () => {
    const swap: AllowedSwap = {
      fromAssetId: AddressZero,
      fromChainId: 1337,
      hardcodedRate: "1",
      priceType: "hardcoded",
      toAssetId: AddressZero,
      toChainId: 1338,
    };
    const blank = await store.getLatestRebalance(swap);
    expect(blank).to.be.undefined;
    await store.saveRebalance({
      id: uuidv4(),
      status: RouterRebalanceStatus.APPROVED,
      swap,
    });

    await delay(10);
    await store.saveRebalance({
      id: uuidv4(),
      status: RouterRebalanceStatus.APPROVED,
      swap,
    });

    await delay(10);
    const id1 = uuidv4();
    await store.saveRebalance({
      id: id1,
      status: RouterRebalanceStatus.APPROVED,
      swap,
    });

    const all = await store.prisma.autoRebalance.findMany();
    expect(all.length).to.eq(3);

    let latest = await store.getLatestRebalance(swap);
    expect(latest!.id).to.eq(id1);

    const approveHash = getRandomBytes32();
    const executeHash = getRandomBytes32();
    await store.saveRebalance({
      id: id1,
      status: RouterRebalanceStatus.EXECUTED,
      swap,
      approveHash,
      executeHash,
    });
    latest = await store.getLatestRebalance(swap);
    expect(latest!.id).to.eq(id1);
    expect(latest!.status).to.eq(RouterRebalanceStatus.EXECUTED);
    expect(latest!.approveHash).to.eq(approveHash);
    expect(latest!.executeHash).to.eq(executeHash);
    expect(latest!.completeHash).to.be.undefined;

    const completeHash = getRandomBytes32();
    await store.saveRebalance({
      id: id1,
      status: RouterRebalanceStatus.EXECUTED,
      swap,
      completeHash,
    });
    latest = await store.getLatestRebalance(swap);
    expect(latest!.id).to.eq(id1);
    expect(latest!.status).to.eq(RouterRebalanceStatus.EXECUTED);
    expect(latest!.approveHash).to.eq(approveHash);
    expect(latest!.executeHash).to.eq(executeHash);
    expect(latest!.completeHash).to.eq(completeHash);
  });
});
