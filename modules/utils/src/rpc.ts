import { ChannelRpcMethod, ChannelRpcMethodsPayloadMap, EngineParams } from "@connext/vector-types";

export function payloadId(): number {
  const date = new Date().getTime() * Math.pow(10, 3);
  const extra = Math.floor(Math.random() * Math.pow(10, 3));
  return date + extra;
}

export const constructRpcRequest = <T extends ChannelRpcMethod>(
  method: T,
  params: ChannelRpcMethodsPayloadMap[T],
): EngineParams.RpcRequest => {
  return {
    id: payloadId(),
    jsonrpc: "2.0",
    method,
    params,
  };
};
