import { providers } from "ethers";
import { createStubInstance } from "sinon";

export const mockProvider = createStubInstance(providers.JsonRpcProvider, {
  waitForTransaction: Promise.resolve({} as any),
  getNetwork: Promise.resolve({ chainId: 1337, name: "" }),
});
