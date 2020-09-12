import { PublicIdentifier } from "@connext/vector-types";

export type GenericErrorResponse = {
  message: string;
};

export type GenericSuccessResponse = {
  success: true;
};

export type SetupInput = {
  counterpartyIdentifier: PublicIdentifier;
  chainId: number;
  timeout: string;
};

export type CreateChannelInput = {
  counterpartyIdentifier: PublicIdentifier;
  chainId: number;
  timeout: string;
};
