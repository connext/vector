import { JsonRpcProvider } from "@ethersproject/providers";
import { createStubInstance } from "sinon";

export const mockProvider = createStubInstance(JsonRpcProvider, {
  waitForTransaction: Promise.resolve({} as any),
  getNetwork: Promise.resolve({ chainId: 1337, name: "" }),
});
