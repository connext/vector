import { PublicIdentifier } from "@connext/vector-types";

export type SetupInput = {
  counterpartyIdentifier: PublicIdentifier;
  chainId: number;
  timeout: string;
};
