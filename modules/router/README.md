# Vector Router
Router is an automated module that allows a `server-node` to act as an intermediary in hopped transactions between different peers in a network. For now, nodes that have the router enabled, i.e. `routing nodes` can only forward transfers to non-routing peers. Eventually, this routing module can be expanded to allow routing nodes to route value to other routing nodes, thereby creating a fully-decentralized state channel network.

## Basics
Router consumes the `server-node` gRPC interface to do the following:
1. Listen to incoming events from the node for inbound transfers.
2. Parse the transfer metadata to find routing information (`recipient`, `chainId`, `assetId`, `requireOnline`, etc.).
3. Look up the recipient's channel using the above info.
4. Check that the recipient's channel has enough collateral. If not, send a deposit to collateralize the channel and wait for it to be completed.
    - As part of resolving transfers, the router will also reclaim collateral from channels.
5. Dispatch the transfer. If the transfer fails *and* the transfer requires that the recipient is online, then hard error and cancel the sender side transfer too. Else, store the transfer and wait for the recipient to come back online.
6. When a recipient comes online, the node emits an `isAlive` event for that channel. Router should catch `isAlive` events and complete all pending transfers to the recipient.

Note that validation around allowed transfer types all happens in the node itself.

## Rebalancing
Apart from automatically forwarding transfers, the secondary job of the router is to execute collateralizaation and reclaims (deposits/withdraws) on relevant channels. The specific amounts and frequency with which to perform these operations is specific to the needs of a node and can be optimized over time with usage data on a per-channel basis.

We call the basic params with which a router can decide when and for how much to rebalance a `rebalance profile`. Profiles look like this:
// TODO is this the best way to represent this?

```typescript
// E.g. Eth
const ethProfile: RebalanceProfile = {
    max: 0.5, // The maximum amount of funds a router will allow in its balance for a given channel before it performs a reclaim to withdraw its funds
    min: 0.1, // The minimum amount of funds a router will allow in its balance for a given channel before it performs a collateralization to top up the channel
    target: 0.25 // The target amount that a router will reclaim/collateralize to after performing the op. 
}
```

We expose two ways for rebalancing values to be set in the router:
1. A fallback profile which is set per routing node as part of the initial setup configuration. The node spins up with a sane default for Eth and tokens in dev-mode, but prod-mode routers will default all profiles to `UNSUPPORTED`. Routing node operators **MUST** set up profiles themselves before going to production.
2. An API with which profiles can be configured in real-time from an external data source. In this case, the routing node will query the data source prior to deciding on whether to rebalance. The interface for the above is very basic (for now):

```typescript
// Router calls this function, and will use the fallback profile if it receives no response or no plug-in data is configured
async function getRebalanceProfile(
    channelAddress: string,
    assetId: string, // TODO should it be combined with the below into a more expressive type?
    chainId: number
): Promise<RebalanceProfile> {}
```

As a final note, because profiles default to `UNSUPPORTED` in production, a routing node operator effectively chooses which assets (on which chains) they want to support simply by setting up a profile for them.

## In-flight Swaps
In many cases, transfers that are being forwarded by a router may be across chains or assetIds. Connext itself isn't opinionated about what chain/asset a transfer propagates in, it simply acts as a system for communicating value - this means a transfer can be routed over any number of assets on any number of chains before reaching its final destination.

For this to happen, parameters around acceptable swaps and rates need to be set up as part of the config. // TODO what should this look like?

