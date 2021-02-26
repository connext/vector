import { Type, Static } from "@sinclair/typebox";

import { TBytes32, TAddress, TChainId, TPublicIdentifier, TransferQuoteSchema } from "./basic";

////////////////////////////////////////
// Router Schemas

// The router is a thin wrapper around a server-node
// that allows the server-node to act as an intelligent
// intermediary for routing payments.

// The router will need to be able to parse metadata
// from the server-node/engine to successfully forward
// transfer creations/resolutions. While the server-node/
// engine/protocl can be unopinionated about the meta, the
// router cannot. The meta is captured by the router listeners
// and should be parsed/validated once it is registered. Only
// transfers with valid routing metas should be routed

const TPathSchema = Type.Object({
  recipient: TPublicIdentifier,
  recipientChainId: TChainId,
  recipientAssetId: TAddress,
});

const TRoutingMeta = Type.Object({
  routingId: TBytes32,
  requireOnline: Type.Boolean(),
  path: Type.Array(TPathSchema),
  quote: Type.Optional(TransferQuoteSchema),
});

// Namespace exports
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace RouterSchemas {
  export const RouterMeta = TRoutingMeta;
  export type RouterMeta = Static<typeof TRoutingMeta>;
}
