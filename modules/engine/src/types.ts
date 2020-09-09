import { UpdateType } from "@connext/vector-types";

import { InboundChannelError } from "./utils";

export type VectorChannelMessage<T extends UpdateType = any> = {
  to: string;
  from: string;
  data: T | any; // TODO: Should be typed based on message
};

export type VectorErrorMessage = Omit<VectorChannelMessage, "data"> & {
  error: InboundChannelError;
};

export type VectorMessage = VectorChannelMessage | VectorErrorMessage;

export type Values<E> = E[keyof E];

// TODO: fix these interfaces!
export type ILockService = any;
export type IMessagingService = any;
export type IOnchainService = any;
