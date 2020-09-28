import {
  ChainAddresses,
  ChannelUpdateEvent,
  IChannelSigner,
  ProtocolEventName,
  ProtocolEventPayloadsMap,
  Result,
  UpdateType,
  WithdrawalCreatedPayload,
  WITHDRAWAL_CREATED_EVENT,
  WithdrawResolverEncoding,
  WithdrawState,
  WithdrawStateEncoding,
} from "@connext/vector-types";
import {
  createTestChannelState,
  getTestLoggers,
  getRandomChannelSigner,
  mkSig,
  mkAddress,
  expect,
} from "@connext/vector-utils";
import { Vector } from "@connext/vector-protocol";
import { Evt } from "evt";
import Sinon from "sinon";

import { setupEngineListeners } from "../listeners";
import { getEngineEvtContainer } from "../utils";

import { MemoryStoreService } from "./services/store";
import { env } from "./env";

const testName = "Engine listeners unit";
const { log } = getTestLoggers(testName, env.logLevel);

describe.skip(testName, () => {
  // Get env constants
  const chainId = parseInt(Object.keys(env.chainProviders)[0]);
  const withdrawDefinition = env.contractAddresses[chainId].Withdraw.address;
  const chainAddresses: ChainAddresses = {
    [chainId]: {
      withdrawDefinition,
      channelFactoryAddress: env.contractAddresses[chainId].ChannelFactory.address,
      channelMastercopyAddress: env.contractAddresses[chainId].ChannelMastercopy.address,
      linkedTransferDefinition: env.contractAddresses[chainId].LinkedTransfer.address,
    },
  };

  // Get test constants
  const alice: IChannelSigner = getRandomChannelSigner();
  const bob: IChannelSigner = getRandomChannelSigner();
  const messaging = {} as any;
  const container = getEngineEvtContainer();

  // Declare mocks
  let store: Sinon.SinonStubbedInstance<MemoryStoreService>;

  // Create an EVT to post to, that can be aliased as a
  // vector instance
  const evt = Evt.create<ChannelUpdateEvent>();
  // Set vector stub to interact with this EVT instance
  const on = (
    event: ProtocolEventName,
    callback: (payload: ProtocolEventPayloadsMap[typeof event]) => void | Promise<void>,
    filter: (payload) => boolean = _payload => true,
  ) => evt.pipe(filter).attach(callback);

  let vector: Sinon.SinonStubbedInstance<Vector>;

  beforeEach(() => {
    // Create the mocked instances
    store = Sinon.createStubInstance(MemoryStoreService);

    vector = Sinon.createStubInstance(Vector);
    vector.on = on as any;
  });

  afterEach(() => Sinon.restore());

  describe("withdraw", () => {
    it("should work", async () => {
      await setupEngineListeners(container, vector, messaging, bob, store, chainAddresses, log);

      const withdrawInitialState: WithdrawState = {
        balance: { to: [alice.address, bob.address], amount: ["5", "0"] },
        nonce: "1",
        aliceSignature: mkSig(),
        signers: [alice.address, bob.address],
        data: "0x",
        fee: "1",
      };

      const updatedChannelState = createTestChannelState(UpdateType.create, {
        latestUpdate: {
          assetId: mkAddress(),
          toIdentifier: bob.publicIdentifier,
          details: {
            transferDefinition: withdrawDefinition,
            transferInitialState: withdrawInitialState,
            transferEncodings: [WithdrawStateEncoding, WithdrawResolverEncoding],
          },
        },
        networkContext: {
          withdrawDefinition,
          chainId,
        },
      });

      // Set the resolve mock to return a result
      vector.resolve.resolves(
        Result.ok(
          createTestChannelState(UpdateType.resolve, {
            latestUpdate: {
              fromIdentifier: bob.publicIdentifier,
            },
          }),
        ),
      );

      const createdEvent = new Promise<WithdrawalCreatedPayload>(resolve =>
        container[WITHDRAWAL_CREATED_EVENT].attachOnce(5000, resolve),
      );

      // Post to the evt
      evt.post({ updatedChannelState });
      const emitted = await createdEvent;

      // Verify the emitted event
      expect(emitted).to.containSubset({
        assetId: updatedChannelState.latestUpdate.assetId,
        amount: "5",
        recipient: alice.address,
        channelBalance: updatedChannelState.latestUpdate.balance,
        channelAddress: updatedChannelState.channelAddress,
      });

      // Verify the double signed commitment was stored
      expect(store.saveWithdrawalCommitment.callCount).to.be.eq(1);
      const [storeTransferId, withdrawCommitment] = store.saveWithdrawalCommitment.args[0];
      expect(storeTransferId).to.be.eq(updatedChannelState.latestUpdate.details.transferId);
      expect(withdrawCommitment.aliceSignature).to.be.ok;
      expect(withdrawCommitment.bobSignature).to.be.ok;

      // Verify that resolve was called correctly
      expect(vector.resolve.callCount).to.be.eq(1);
      const { transferResolver, channelAddress, transferId } = vector.resolve.args[0][0];
      expect(transferResolver).to.be.ok;
      expect(channelAddress).to.be.eq(updatedChannelState.channelAddress);
      expect(transferId).to.be.eq(updatedChannelState.latestUpdate.details.transferId);
    });
  });
});
