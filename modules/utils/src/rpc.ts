import { ChannelRpcMethod, ChannelRpcMethodsPayloadMap, EngineParams } from "@connext/vector-types";

export const constructRpcRequest = <T extends ChannelRpcMethod>(
  method: T,
  params: ChannelRpcMethodsPayloadMap[T],
): EngineParams.RpcRequest => {
  return {
    id: Date.now(),
    jsonrpc: "2.0",
    method,
    params,
  };
};
