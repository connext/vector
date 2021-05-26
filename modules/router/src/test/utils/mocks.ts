import { ChainRpcProvider } from "@connext/vector-types";
import { createStubInstance } from "sinon";

export const mockProvider = createStubInstance(ChainRpcProvider, {
  waitForTransaction: Promise.resolve({ logs: [] } as any),
  getNetwork: Promise.resolve({ chainId: 1337, name: "" }),
});
