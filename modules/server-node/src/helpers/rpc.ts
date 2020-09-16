import { ChannelRpcMethods, ChannelRpcMethodsPayloadMap, RpcRequestInput } from "@connext/vector-types";

export const constructRpcRequest = <T extends ChannelRpcMethods>(
  method: T,
  params: ChannelRpcMethodsPayloadMap[T],
): RpcRequestInput => {
  return {
    id: Date.now(),
    jsonrpc: "2.0",
    method,
    params,
  };
};
