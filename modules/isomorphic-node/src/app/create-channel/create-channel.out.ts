import { ChannelResult } from '@statechannels/client-api-schema';

import { Output } from '../core/definitions/output';

export interface CreateChannelOutput extends Output {
  channelResult: ChannelResult;
  completed: () => Promise<ChannelResult>;
}
