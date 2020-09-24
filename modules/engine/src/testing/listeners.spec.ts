import {
  ChannelUpdateEvent,
  IChannelSigner,
  IVectorProtocol,
  ProtocolEventName,
  ProtocolEventPayloadsMap,
  UpdateType,
} from "@connext/vector-types";
import { createTestChannelState, getRandomChannelSigner, mkAddress, mkPublicIdentifier } from "@connext/vector-utils";
import { Evt } from "evt";

import { setupListeners } from "../listeners";

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

  const vector: IVectorProtocol = {
    on: (
      event: ProtocolEventName,
      callback: (payload: ProtocolEventPayloadsMap[typeof event]) => void | Promise<void>,
      filter: (payload) => boolean = _payload => true,
    ) => evt.pipe(filter).attach(callback),
  } as any;

  const messaging = {} as any;

  const signer: IChannelSigner = getRandomChannelSigner();

  describe("withdraw", () => {
    it("should work", async () => {
      await setupListeners(vector, messaging, signer);

      const updatedChannelState = createTestChannelState(UpdateType.create, {
        latestUpdate: {
          fromIdentifier: mkPublicIdentifier(),
          details: { transferDefinition: mkAddress("0xdef") },
        },
        networkContext: {
          withdrawDefinition: mkAddress("0xdef"),
        },
      });

      // Post to the evt
      evt.post({ updatedChannelState });
    });
  });
});
