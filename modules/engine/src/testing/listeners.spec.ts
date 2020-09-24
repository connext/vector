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
  delay,
  getRandomChannelSigner,
  mkAddress,
  mkPublicIdentifier,
  mkSig,
} from "@connext/vector-utils";
import { Vector } from "@connext/vector-protocol";
import { Evt } from "evt";
import Sinon from "sinon";

import { setupListeners } from "../listeners";
import { expect } from "chai";

// Adds a handler to an evt instance and returns the result
// based on the input arguments
export function addEvtHandler<T = any>(
  evt: Evt<T>,
  callback: (event: T) => void | Promise<void>,
  filter?: (event: T) => boolean,
  timeout?: number,
): Evt<T> | Promise<T> {
  // NOTE: If this type is not an array with a length, then using
  // the spread operator will cause errors on the evt package
  const attachArgs = [filter, timeout, callback].filter(x => !!x) as [any, any, any];
  return evt.attach(...attachArgs);
}

describe.only("listeners", () => {
  // Create an EVT to post to, that can be aliased as a
  // vector instance

  const evt = Evt.create<ChannelUpdateEvent>();
  const alice: IChannelSigner = getRandomChannelSigner();
  const bob: IChannelSigner = getRandomChannelSigner();
  const messaging = {} as any;

  // Set vector stub to interact with this EVT instance
  const on = (
    event: ProtocolEventName,
    callback: (payload: ProtocolEventPayloadsMap[typeof event]) => void | Promise<void>,
    filter: (payload) => boolean = _payload => true,
  ) => evt.pipe(filter).attach(callback);

  let vector: Sinon.SinonStubbedInstance<Vector>;

  beforeEach(() => {
    vector = Sinon.createStubInstance(Vector);
    // TODO: good way to work with events and sinon?
    vector.on = on as any;
  });

  afterEach(() => Sinon.restore());

  describe("withdraw", () => {
    it("should work", async () => {
      await setupListeners(vector, messaging, bob);

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
