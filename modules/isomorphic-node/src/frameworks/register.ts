import { asClass, asValue, createContainer, InjectionMode, asFunction } from "awilix";
import joi from "joi";
import { ILockService, IStoreService, IChannelSigner } from "@connext/vector-types";

import { IsomorphicNode, IIsomorphicNode } from "../core/app";
import { CreateChannelUseCase } from "../core/usecases/create-channel/create-channel.usecase";
import { CreateChannelValidatorImpl } from "../data/core/create-channel/create-channel.validator.impl";
import { DepositUseCase } from "../core/usecases/deposit/deposit.usecase";
import { CreateTransferUseCase } from "../core/usecases/create-transfer/create-transfer.usecase";
import { TempNatsMessagingService } from "../data/core/shared/messaging/messaging.service.impl";
import { WalletService } from "../data/core/shared/wallet/wallet.service.impl";

const container = createContainer({ injectionMode: InjectionMode.CLASSIC });

export interface IIsomorphicNodeConfig {
  lockService: ILockService;
  storeService: IStoreService;
  signer: IChannelSigner;
}
export const registerWithConfig = ({ lockService, storeService, signer }: IIsomorphicNodeConfig): IIsomorphicNode => {
  container.register({
    // Node_modules
    joi: asValue(joi),

    app: asClass(IsomorphicNode).singleton(),

    // errors

    // shared services
    walletService: asFunction(({ messagingService }) => {
      return new WalletService(storeService, messagingService, lockService, signer);
    }).singleton(),
    messagingService: asClass(TempNatsMessagingService).singleton(),

    // validators
    createChannelValidator: asClass(CreateChannelValidatorImpl).singleton(),
    depositValidator: asClass(CreateChannelValidatorImpl).singleton(),
    createTransferValidator: asClass(CreateChannelValidatorImpl).singleton(),

    // usecases
    createChannelUseCase: asClass(CreateChannelUseCase).singleton(),
    depositUseCase: asClass(DepositUseCase).singleton(),
    createTransferUseCase: asClass(CreateTransferUseCase).singleton(),

    // repositories
  });
  const main = container.resolve<IsomorphicNode>("app");
  return main;
};
