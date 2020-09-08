import { asClass, asValue, createContainer, InjectionMode } from "awilix";
import joi from "joi";

import { App } from "../app/app";
import { CreateChannelUseCase } from "../app/core/usecases/create-channel/create-channel.usecase";
import { CreateChannelValidatorImpl } from "../data/core/create-channel/create-channel.validator.impl";
import { DepositUseCase } from "../app/core/usecases/deposit/deposit.usecase";
import { CreateTransferUseCase } from "../app/core/usecases/create-transfer/create-transfer.usecase";
import { mockWalletService } from "../test/mocks/wallet";
import { MockMessagingService } from "../test/mocks/messaging-service";

const container = createContainer({ injectionMode: InjectionMode.CLASSIC });

container.register({
  // Node_modules
  joi: asValue(joi),

  app: asClass(App).singleton(),

  // errors

  // shared services
  walletService: asValue(mockWalletService),
  messagingService: asClass(MockMessagingService).singleton(),

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

const main = container.resolve<App>("app");
export const app = {
  main,
  container,
};
