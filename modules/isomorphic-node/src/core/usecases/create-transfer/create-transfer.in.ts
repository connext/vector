import { Input } from "../../definitions/input";

export interface CreateTransferInput extends Input {
  channelId: string;
  amount: string;
  assetId: string;
  recipient?: string;
  paymentId: string;
  preImage: string;
  meta?: Record<string, unknown>;
}
