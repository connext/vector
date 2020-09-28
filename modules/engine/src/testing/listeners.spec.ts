import {
  ChannelUpdateEvent,
  IChannelSigner,
  ProtocolEventName,
  ProtocolEventPayloadsMap,
  Result,
  UpdateType,
  WithdrawResolverEncoding,
  WithdrawState,
  WithdrawStateEncoding,
} from "@connext/vector-types";
import {
  createTestChannelState,
  getTestLoggers,
  delay,
  getRandomChannelSigner,
  mkAddress,
  mkSig,
} from "@connext/vector-utils";
import { Vector } from "@connext/vector-protocol";
import { Evt } from "evt";
import Sinon from "sinon";
import { expect } from "chai";

import { setupEngineListeners } from "../listeners";
import { getEngineEvtContainer } from "../utils";

import { MemoryStoreService } from "./services/store";
import { env } from "./env";

const testName = "Engine listeners unit";
const { log } = getTestLoggers(testName, env.logLevel);

describe.only(testName, () => {
  // Get test constants
  const alice: IChannelSigner = getRandomChannelSigner();
  const bob: IChannelSigner = getRandomChannelSigner();
  const messaging = {} as any;
  const container = getEngineEvtContainer();
  const chainAddresses = env.chainAddresses;

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
        initiatorSignature: mkSig(),
        signers: [alice.address, bob.address],
        data: "0x",
        fee: "1",
      };

      const updatedChannelState = createTestChannelState(UpdateType.create, {
        latestUpdate: {
          toIdentifier: bob.publicIdentifier,
          details: {
            transferDefinition: mkAddress("0xdef"),
            transferInitialState: withdrawInitialState,
            transferEncodings: [WithdrawStateEncoding, WithdrawResolverEncoding],
          },
        },
        networkContext: {
          withdrawDefinition: mkAddress("0xdef"),
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

      // Post to the evt
      evt.post({ updatedChannelState });
      // Wait a bit to give handler time to react
      await delay(1500);

      // Verify that resolve was called correctly
      expect(vector.resolve.callCount).to.be.eq(1);
      const { transferResolver, channelAddress, transferId } = vector.resolve.args[0][0];
      expect(transferResolver).to.be.ok;
      expect(channelAddress).to.be.eq(updatedChannelState.channelAddress);
      expect(transferId).to.be.eq(updatedChannelState.latestUpdate.details.transferId);
    });
  });
});
