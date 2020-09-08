import { IsomorphicNode } from "./core/app";
import { app } from "./frameworks/register";

export const createNode = async (): Promise<IsomorphicNode> => {
  return app.main;
};

export { IsomorphicNode };
export { CreateChannelInput } from "./core/usecases/create-channel/create-channel.in";
export { CreateChannelOutput } from "./core/usecases/create-channel/create-channel.out";
export { DepositInput } from "./core/usecases/deposit/deposit.in";
export { DepositOutput } from "./core/usecases/deposit/deposit.out";
export { CreateTransferInput } from "./core/usecases/create-transfer/create-transfer.in";
export { CreateTransferOutput } from "./core/usecases/create-transfer/create-transfer.out";
