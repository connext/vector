import { UpdateParams, FullChannelState, ChannelUpdate } from "./channel";
export class Result<T, Y = any> {
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
      // NOTE: Error.message is not returned as a property
      // on default
      error:
        this.error instanceof Error
          ? {
              ...this.error,
              message: this.error.message,
            }
          : this.error,
    };
  }

  public static fromJson<U, Y extends Error>(json: ResultJson<U, Y>): Result<U, Y> {
    return json.isError ? Result.fail(json.error) : Result.ok(json.value);
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
  name: string;
  context: any;
  type: string;
  stack?: string;
};
export abstract class VectorError extends Error {
  abstract readonly type: string;
  static readonly reasons: { [key: string]: string };

  constructor(public readonly msg: Values<typeof VectorError.reasons>, public readonly context: any = {}) {
    super(msg);
  }

  public toJson(): VectorErrorJson {
    return {
      message: this.message,
      name: this.name,
      context: this.context,
      type: this.type,
      stack: this.stack,
    };
  }
}

export class MessagingError extends VectorError {
  readonly type = "MessagingError";

  static readonly reasons = {
    Timeout: "Request timed out",
    Unknown: "Unknown messaging error",
  } as const;

  constructor(public readonly message: Values<typeof MessagingError.reasons>, public readonly context: any = {}) {
    super(message, context);
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
  ) {
    super(msg, { ...context, update, state, params });
    this.context = { ...context, update, state, params };
  }
}

export type EngineErrorContext = {
  channelAddress: string;
  publicIdentifier: string;
} & any;
export abstract class EngineError extends VectorError {
  readonly context: EngineErrorContext;

  constructor(public readonly msg: string, channelAddress: string, publicIdentifier: string, context: any = {}) {
    super(msg, { ...context, channelAddress, publicIdentifier });
    this.context = { ...context, channelAddress, publicIdentifier };
  }
}

// NOTE: because this error is used between the browserNode AND
// the serverNode, it must stay in the types module
// TODO: break out into browser-node and server-node error types
export type LockErrorContext = {
  params: UpdateParams<any>;
  state?: FullChannelState;
} & any;
export class LockError extends VectorError {
  readonly type = "LockError";

  static readonly reasons = {
    Unknown: "Unknown Lock Error", // TODO
  };

  public context: LockErrorContext;

  constructor(public readonly message: string, lockName: string, context: any = {}) {
    super(message, { ...context, lockName });
    this.context = { ...context, lockName };
  }
}

// NOTE: because this error is used between the browserNode AND
// the serverNode, it must stay in the types module

// TODO: break out into browser-node and server-node error types
export class NodeError extends VectorError {
  readonly type = "NodeError";

  static readonly reasons = {
    InternalServerError: "Failed to send request",
    InvalidParams: "Request has invalid parameters",
    MultinodeProhibitted: "Not allowed to have multiple nodes",
    NoEvts: "No evts for event",
    NoPublicIdentifier: "Public identifier not supplied, and no default identifier",
    Timeout: "Timeout",
  } as const;

  constructor(public readonly message: Values<typeof NodeError.reasons>, public readonly context: any = {}) {
    super(message, context);
  }
}
