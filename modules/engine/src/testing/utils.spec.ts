import { WithdrawCommitment, VectorChainService } from "@connext/vector-contracts";
import {
  ChainAddresses,
  ChannelUpdateEvent,
  IChannelSigner,
  ProtocolEventName,
  ProtocolEventPayloadsMap,
  Result,
  RegisteredTransfer,
  TransferNames,
  IVectorChainService,
} from "@connext/vector-types";
import {
  getTestLoggers,
  getRandomChannelSigner,
  mkAddress,
  expect,
  MemoryStoreService,
  getRandomBytes32,
  createTestChannelState,
  MemoryMessagingService,
} from "@connext/vector-utils";
import { Vector } from "@connext/vector-protocol";
import { Evt } from "evt";
import Sinon from "sinon";
import { submitUnsubmittedWithdrawals, getEngineEvtContainer } from "../utils";
import * as utils from "../utils";

import { env } from "./env";

const testName = "Engine utils unit";
const { log } = getTestLoggers(testName, env.logLevel);
console.log("env.logLevel: ", env.logLevel);
const chainId = parseInt(Object.keys(env.chainProviders)[0]);
describe(testName, () => {
  // Get env constants
  const withdrawAddress = mkAddress("0xdefff");
  const chainAddresses: ChainAddresses = {
    [chainId]: {
      channelFactoryAddress: env.chainAddresses[chainId].channelFactoryAddress,
      transferRegistryAddress: env.chainAddresses[chainId].transferRegistryAddress,
    },
  };

  // Get test constants
  const alice: IChannelSigner = getRandomChannelSigner();
  const bob: IChannelSigner = getRandomChannelSigner();
  const container = getEngineEvtContainer();
  const withdrawTransactionHash = getRandomBytes32();
  const withdrawRegisteredInfo: RegisteredTransfer = {
    definition: withdrawAddress,
    resolverEncoding: "resolve",
    stateEncoding: "state",
    name: TransferNames.Withdraw,
    encodedCancel: "encodedCancel",
  };

  // Declare mocks
  let store: Sinon.SinonStubbedInstance<MemoryStoreService>;
  let chainService: Sinon.SinonStubbedInstance<VectorChainService>;
  let messaging: Sinon.SinonStubbedInstance<MemoryMessagingService>;
  let withdrawRetryForTrasferIdStub: Sinon.SinonStub;

  // Create an EVT to post to, that can be aliased as a
  // vector instance
  const evt = Evt.create<ChannelUpdateEvent>();
  // Set vector stub to interact with this EVT instance
  const on = (
    event: ProtocolEventName,
    callback: (payload: ProtocolEventPayloadsMap[typeof event]) => void | Promise<void>,
    filter: (payload) => boolean = () => true,
  ) => evt.pipe(filter).attach(callback);

  let vector: Sinon.SinonStubbedInstance<Vector>;

  beforeEach(() => {
    // Create the mocked instances
    store = Sinon.createStubInstance(MemoryStoreService);
    // By default withdraw submission succeeds
    chainService = Sinon.createStubInstance(VectorChainService, {
      sendWithdrawTx: Promise.resolve(
        Result.ok({
          transactionHash: withdrawTransactionHash,
        }),
      ) as any,
      getRegisteredTransferByName: Promise.resolve(Result.ok(withdrawRegisteredInfo)),
    });

    vector = Sinon.createStubInstance(Vector);
    messaging = Sinon.createStubInstance(MemoryMessagingService);
    vector.on = on as any;

    withdrawRetryForTrasferIdStub = Sinon.stub(utils, "withdrawRetryForTransferId");
  });

  afterEach(() => {
    // Restore all mocks
    Sinon.restore();

    // Remove all evt listeners
    evt.detach();
  });

  describe("submitUnsubmittedWithdrawals", () => {
    it("should work", async () => {
      chainService.getWithdrawalTransactionRecord.onFirstCall().resolves(Result.ok(true));
      chainService.getWithdrawalTransactionRecord.resolves(Result.ok(false));

      const channel = createTestChannelState("create", { alice: alice.address, bob: bob.address });
      channel.channel.networkContext.chainId = chainId;

      const commitment = new WithdrawCommitment(
        channel.channel.channelAddress,
        alice.address,
        bob.address,
        mkAddress("0xabc"),
        channel.transfer.assetId,
        "1",
        channel.channel.nonce.toString(),
      );
      const aliceSig = await alice.signMessage(commitment.hashToSign());
      const bobSig = await bob.signMessage(commitment.hashToSign());

      await commitment.addSignatures(aliceSig, bobSig);

      store.getUnsubmittedWithdrawals.resolves([
        {
          commitment: commitment.toJson(),
          transfer: channel.transfer,
        },
        {
          commitment: commitment.toJson(),
          transfer: channel.transfer,
        },
      ]);

      //   const res = await withdrawRetryForTrasferId
      await submitUnsubmittedWithdrawals(
        channel.channel,
        store,
        chainAddresses,
        chainService as IVectorChainService,
        log,
        messaging,
        channel.channel.aliceIdentifier,
      );

      expect(chainService.sendWithdrawTx.callCount).to.eq(1);
      expect(store.saveWithdrawalCommitment.callCount).to.eq(2);
    });
  });
});
