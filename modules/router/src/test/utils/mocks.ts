import { ChainProvider } from "@connext/vector-types";
import { createStubInstance } from "sinon";

export const mockProvider = createStubInstance(ChainProvider, {
  waitForTransaction: Promise.resolve({ logs: [] } as any),
  getNetwork: Promise.resolve({ chainId: 1337, name: "" }),
});
