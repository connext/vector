import { IIsomorphicNode } from "./core/app";
import { registerWithConfig } from "./frameworks/register";

export const createNode = registerWithConfig;

export { IIsomorphicNode as IsomorphicNode };
export { CreateChannelInput } from "./core/usecases/create-channel/create-channel.in";
export { CreateChannelOutput } from "./core/usecases/create-channel/create-channel.out";
export { DepositInput } from "./core/usecases/deposit/deposit.in";
export { DepositOutput } from "./core/usecases/deposit/deposit.out";
export { CreateTransferInput } from "./core/usecases/create-transfer/create-transfer.in";
export { CreateTransferOutput } from "./core/usecases/create-transfer/create-transfer.out";
