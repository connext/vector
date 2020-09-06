import { ID } from '../../../../app/core/definitions/id';
import { Presenter, PresenterOutput } from '../../../../app/core/definitions/presenter';
import { CreateChannelOutput } from '../../../../app/create-channel/create-channel.out';

export interface DepositPresenterOutput extends PresenterOutput {
  id: ID;
  balance: number;
}

export interface DepositPresenter extends Presenter<CreateChannelOutput> {
  present(data: CreateChannelOutput): Promise<DepositPresenterOutput>;
}
