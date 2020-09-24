import { ChannelUpdateEvent, IChannelSigner, IVectorProtocol, UpdateType } from "@connext/vector-types";
import { createTestChannelState, getRandomChannelSigner, mkAddress } from "@connext/vector-utils";
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

  const evt: Evt<ChannelUpdateEvent> = Evt.create();

  const vector: IVectorProtocol = {
    on: (...args: any[]) => addEvtHandler(evt, args[0], args[1], args[2]),
  } as any;

  const messaging = {} as any;

  const signer: IChannelSigner = getRandomChannelSigner();

  describe("withdraw", () => {
    it("should work", async () => {
      await setupListeners(vector, messaging, signer);

      const updatedChannelState = await createTestChannelState(UpdateType.create, {
        latestUpdate: {
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
