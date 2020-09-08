import { asClass, asValue, createContainer, InjectionMode } from "awilix";
import joi from "joi";

import { App } from "../app/app";
import { CreateChannelInteractor } from "../app/create-channel/create-channel.interactor";
import { ApplicationErrorFactoryImpl } from "../data/core/errors/application-error-factory.impl";
import { CreateChannelValidatorImpl } from "../data/create-channel/create-channel.validator.impl";

const container = createContainer({ injectionMode: InjectionMode.CLASSIC });

container.register({
  // Node_modules
  joi: asValue(joi),

  app: asClass(App),

  // errors
  errorFactory: asClass(ApplicationErrorFactoryImpl),

  // validators
  createChannelValidator: asClass(CreateChannelValidatorImpl),

  // interactors
  createChannelInteractor: asClass(CreateChannelInteractor),

  // repositories
});

const main = container.resolve<App>("app");
export const app = {
  main,
  container,
};
