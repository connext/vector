import { Input } from "../../definitions/input";

export interface CreateChannelInput extends Input {
  publicIdentifier: string;
  chainId: number;
}
