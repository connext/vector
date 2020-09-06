import { CreateChannelOutput } from '../../../../app/create-channel/create-channel.out';

import { DepositPresenter, DepositPresenterOutput } from './deposit.presenter';

export class DepositPresenterImpl implements DepositPresenter {
  present(data: CreateChannelOutput): Promise<DepositPresenterOutput> {
    return Promise.resolve({ balance: data.balance, id: data.transactionId });
  }
}
