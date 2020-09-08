import { Output } from '../core/definitions/output';

export interface CreateTransferOutput extends Output {
  channelId: string;
  paymentId: string;
  preImage: string;
}
