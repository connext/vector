import { Input } from "../core/definitions/input";

export interface CreateChannelInput extends Input {
  publicIdentifier: string;
  chainId: number;
}
