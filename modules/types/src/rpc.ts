export type JsonRpcRequest<T = any> = {
  id: number;
  jsonrpc: "2.0";
  method: string;
  params: T;
};

export type JsonRpcResponse<T = any> = {
  id: number;
  jsonrpc: "2.0";
  result: T;
};

export type Rpc = {
  id?: number;
  methodName: string;
  parameters: { [key: string]: any } | any[];
};
