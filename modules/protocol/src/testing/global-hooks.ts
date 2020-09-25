import { alice, bob, rando } from "./constants";
import { fundAddress } from "./utils";

async function globalSetup(): Promise<void> {
  await fundAddress(alice.address);
  await fundAddress(bob.address);
  await fundAddress(rando.address);
  global["wallet"] = rando;
}

export const mochaHooks = {
  async beforeAll(): Promise<void> {
    await globalSetup();
  },
};
