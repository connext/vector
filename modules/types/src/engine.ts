import { Bytes32 } from "./basic";

export const ConditionalTransferType = {
  LinkedTransfer: "LinkedTransfer",
} as const;
export type ConditionalTransferType = typeof ConditionalTransferType[keyof typeof ConditionalTransferType];

export type ConditionalTransferResponse = {
  routingId: Bytes32;
};
