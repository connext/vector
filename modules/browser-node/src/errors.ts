import { NodeError, NodeErrorContext, Values } from "@connext/vector-types";

type BrowserNodeErrorContext = NodeErrorContext & {
  publicIdentifier: string;
  routerPublicIdentifier: string;
  params: any;
  iframeSrc?: string;
};

export class BrowserNodeError extends NodeError {
  readonly type = "BrowserNodeError";

  static readonly reasons = {
    MethodNotImplemented: "Method not implemented in browser",
    MultinodeProhibitted: "Cannot configure multiple nodes for browser",
  } as const;

  readonly context: BrowserNodeErrorContext;

  constructor(
    public readonly msg: Values<typeof BrowserNodeError.reasons>,
    publicIdentifier: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    params: any = {},
    context: any = {},
  ) {
    super(msg, { params, publicIdentifier, ...context });
  }
}

export class CrossChainTransferError extends NodeError {
  readonly type = "CrossChainTransferError";

  static readonly reasons = {
    MissingReceiverChannel: "Missing channel on receiver chain",
    MissingSenderChannel: "Missing channel on sender chain",
    MissingWithdrawalAmount: "Withdrawal amount not specified",
    MultinodeProhibitted: "Cannot configure multiple nodes for browser",
    ReceiverEventMissed: "Failed to get receiver event",
  } as const;

  readonly context: BrowserNodeErrorContext;

  constructor(
    public readonly msg: Values<typeof CrossChainTransferError.reasons>,
    publicIdentifier: string,
    // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
    params: any,
    context: any = {},
  ) {
    super(msg, { params, publicIdentifier, ...context });
  }
}
