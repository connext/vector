import { Store } from "./store";

export const getMemoryStore = () => {
  return new Store();
};
