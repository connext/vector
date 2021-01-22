import { NodeError, Values } from "@connext/vector-types";

export type ServerNodeServiceErrorContext = NodeError & {
  requestUrl: string;
  publicIdentifier: string;
  params: any;
};
export class ServerNodeServiceError extends NodeError {
  static readonly type = "ServerNodeServiceError";

  static readonly reasons = {
    InternalServerError: "Failed to send request",
    InvalidParams: "Request has invalid parameters",
    MultinodeProhibitted: "Not allowed to have multiple nodes",
    NoEvts: "No evts for event",
    NoPublicIdentifier: "Public identifier not supplied, and no default identifier",
    Timeout: "Timeout",
  } as const;

  readonly context: ServerNodeServiceErrorContext;

  constructor(
    public readonly msg: Values<typeof ServerNodeServiceError.reasons>,
    publicIdentifier: string,
    requestUrl: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    params: any,
    context: any = {},
  ) {
    super(msg, { requestUrl, publicIdentifier, params, ...context });
  }
}
