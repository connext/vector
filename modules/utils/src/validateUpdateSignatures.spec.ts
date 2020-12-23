import { expect, createTestChannelState } from "./test";
import { getRandomChannelSigner } from "./channelSigner";
import { hashChannelCommitment } from "./channel";
import { validateChannelUpdateSignatures } from "./validateUpdateSignatures";

describe("validateChannelUpdateSignatures", () => {
  const aliceSigner = getRandomChannelSigner();
  const bobSigner = getRandomChannelSigner();
  const wrongSigner = getRandomChannelSigner();
  const state = createTestChannelState("create", { alice: aliceSigner.address, bob: bobSigner.address }).channel;
  const { networkContext, ...core } = state;

  const tests = [
    {
      name: "should work for a valid single signed update",
      updateSignatures: [undefined, "bobSig"],
      requiredSigners: "bob",
      expected: undefined,
    },
    {
      name: "should work for a valid double signed update",
      updateSignatures: ["aliceSig", "bobSig"],
      requiredSigners: "both",
      expected: undefined,
    },
    {
      name: "should fail if there are not at the number of required sigs included",
      updateSignatures: [undefined, "bobSig"],
      requiredSigners: "both",
      expected: "Expected alice + bob",
    },
    {
      name: "should fail if any of the signatures are invalid",
      updateSignatures: [undefined, "wrongSig"],
      requiredSigners: "alice",
      expected: "Expected alice",
    },
  ];

  for (const test of tests) {
    const { name, updateSignatures, requiredSigners, expected } = test;
    it(name, async () => {
      const signatures: (string | undefined)[] = [];

      // Have to do this because of weird race conditions around looping
      for (let i = 0; i < 2; i++) {
        if (updateSignatures[i] == "bobSig") {
          signatures[i] = await bobSigner.signMessage(hashChannelCommitment(core));
        } else if (updateSignatures[i] == "aliceSig") {
          signatures[i] = await aliceSigner.signMessage(hashChannelCommitment(core));
        } else if (updateSignatures[i] == "wrongSig") {
          signatures[i] = await wrongSigner.signMessage(hashChannelCommitment(core));
        } else {
          signatures[i] = updateSignatures[i];
        }
      }

      const ret = await validateChannelUpdateSignatures(
        state,
        signatures[0],
        signatures[1],
        requiredSigners as "alice" | "bob" | "both",
      );

      if (expected) {
        expect(ret.isError).to.be.true;
        expect(ret.getError().message).includes(expected);
      } else {
        expect(ret.isError).to.be.false;
        expect(ret.getValue()).to.be.undefined;
      }
    });
  }
});
