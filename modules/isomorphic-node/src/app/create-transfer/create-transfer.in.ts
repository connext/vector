import { BigNumber } from 'ethers';

import { Input } from '../core/definitions/input';

export interface CreateTransferInput extends Input {
  channelId: string;
  amount: BigNumber;
  assetId: string;
  recipient?: string;
  paymentId: string;
  preImage: string;
  meta?: Record<string, unknown>;
}
