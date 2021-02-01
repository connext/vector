import { UpdateParams, FullChannelState, ChannelUpdate } from "./channel";

export const jsonifyError = (error: VectorError | Error): VectorErrorJson => {
  if (!!(error as any).type) {
    return (error as VectorError).toJson();
  }
  return {
    message: error.message,
    type: error.name,
    context: {},
    stack: error.stack,
  };
};

export class Result<T, Y extends Error = any> {
  private value?: T;
  private error?: Y;

  public isError: boolean;

  private constructor(error?: Y, value?: T) {
    if (error) {
      this.isError = true;
      this.error = error;
    } else {
      this.isError = false;
      this.value = value;
    }
  }

  public getValue(): T {
    if (this.isError) {
      throw new Error(`Can't getValue() of error result: ${this.error}`);
    }
    return this.value as T;
  }

  public getError(): Y | undefined {
    if (this.isError) {
      return this.error as Y;
    }
    return undefined;
  }

  public toJson(): ResultJson {
    if (!this.isError) {
      return { isError: false, value: this.value };
    }
    return {
      isError: true,
      error: jsonifyError(this.error!),
    };
  }

  public static fromJson<U, Y extends Error>(json: ResultJson<U, Y>): Result<U, Y> {
    if (!json.isError) {
      return Result.ok(json.value);
    }
    return (json.error as any).type
      ? (Result.fail(VectorError.fromJson(json.error as any)) as any)
      : Result.fail(json.error);
  }

  public static fail<U, Y extends Error>(error: Y): Result<U, Y> {
    return new Result<U, Y>(error);
  }

  public static ok<T>(result: T): Result<T> {
    return new Result<T>(undefined, result);
  }
}

export type ResultJson<U = any, Y = any> =
  | {
      isError: true;
      error: Y;
    }
  | {
      isError: false;
      value: U;
    };

export type Values<E> = E[keyof E];

// Abstract error for package
export type VectorErrorJson = {
  message: string;
  context: any;
  type: string;
  stack?: string;
};
export class VectorError extends Error {
  static readonly reasons: { [key: string]: string };

  constructor(
    public readonly msg: Values<typeof VectorError.reasons>,
    public readonly context: any = {},
    public readonly type = "VectorError",
  ) {
    super(msg);
  }

  public toJson(): VectorErrorJson {
    return {
      message: this.msg,
      context: this.context,
      type: this.type,
      stack: this.stack,
    };
  }

  public static fromJson(json: VectorErrorJson): VectorError {
    return new VectorError(json.message, json.context, json.type);
  }
}

export class MessagingError extends VectorError {
  static readonly reasons = {
    Timeout: "Request timed out",
    Unknown: "Unknown messaging error",
  } as const;

  constructor(
    public readonly message: Values<typeof MessagingError.reasons>,
    public readonly context: any = {},
    public readonly type = "MessagingError",
  ) {
    super(message, context, type);
  }
}

export type ProtocolErrorContext = {
  state?: FullChannelState;
  params?: UpdateParams<any>;
  update?: ChannelUpdate;
} & any;
export abstract class ProtocolError extends VectorError {
  readonly context: ProtocolErrorContext;

  constructor(
    public readonly msg: string,
    state?: FullChannelState,
    update?: ChannelUpdate,
    params?: UpdateParams<any>,
    context: any = {},
    public readonly type = "ProtocolError",
  ) {
    super(msg, { ...context, update, state, params }, type);
  }
}

export type EngineErrorContext = {
  channelAddress: string;
  publicIdentifier: string;
} & any;
export abstract class EngineError extends VectorError {
  readonly context: EngineErrorContext;

  constructor(
    public readonly msg: string,
    channelAddress: string,
    publicIdentifier: string,
    context: any = {},
    public readonly type = "EngineError",
  ) {
    super(msg, { ...context, channelAddress, publicIdentifier }, type);
  }
}

export type NodeErrorContext = any;
export abstract class NodeError extends VectorError {
  readonly context: NodeErrorContext;

  constructor(public readonly msg: string, context: any = {}, public readonly type: string = "NodeError") {
    super(msg, { ...context }, type);
  }
}

export type RouterErrorContext = any;
export abstract class RouterError extends VectorError {
  readonly context: RouterErrorContext;

  constructor(public readonly msg: string, context: any = {}, public readonly type = "RouterError") {
    super(msg, { ...context }, type);
  }
}
