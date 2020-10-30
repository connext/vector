# Welcome

Welcome to the Connext docs!

At Connext, our goal is to build the cross-chain routing and micropayment layer of the decentralized web. Connext sits on top of Ethereum, evm-compatible L2 blockchains, and other turing-complete chains, and enables instant, near free transfers that can be routed **across chains** and over liquidity in **any asset**. Most importantly, it does this without giving up the trust-minimization properties of the underlying chain.

You can think of Connext as a shared standard for blockchains and other decentralized networks to communicate with each other about value.

## Where Do I Start?

Anyone who is interacting with Connext needs to run a Connext node in some capacity. Connext nodes run the protocol, deploy channels to peers, and transfer value within those channels. We have two implementations of the node:

1. The `server-node`, which uses `docker` to package up core logic and exposes `http` and `gRPC` interfaces.
2. The `browser-node`, which is distributed via `npm` and exposes a typescript/javascript interface.

You can also run the Connext node as an intermediary (we call this a `routing node`), where you forward transfers between different channels. This way, peers can transfer to each other without needing channels directly to one other, but instead by "hopping" value across many different channels through the network. Routing nodes run `server-node`s with an automated module - a `router` - to forward transfers.

- If you're building a browser-based application, check out the [browser-node quick start guide](./quickStart/browserNode.md).
- If you're building a server application or backend/native infrastructure that runs on docker, check out the [server-node quick start guide](./quickStart/serverNode.md)
- If you're building a protocol or network that leverages p2p micropayments, you will want to [write custom transfer logic](./node/transfers.md/#custom-transfer-logic), integrate one or both of the two above nodes into user-facing code, and likely [run a router](./router/configure.md) to bootstrap the network.
- If you want to be a liquidity provider in the network, either to forward transfers or to bridge value across chains, you'll want to [run a router](./router/configure.md).

If you're still confused about where to begin, join us in [our community chat](https://discord.gg/R7yZNmb)! We're **very** responsive and happy to point you to the right resources. :)

## What are State Channels?

Connext is a network of _state channels_. The core concept behind a channel is very simple:

- Suppose you're paying your friend Bob for a metered service at the rate of \$1 every minute.
- It would be silly to broadcast every transaction to the blockchain, you would incur lots of fees. At the same time, it also doesn't make sense to pay up front or pay at the end, as that would introduce new trust assumptions.
- Instead, what you can do is send your funds to a 2/2 multisig controlled by you and Bob. Then, rather than sending onchain transactions, you can send Bob ever updating signatures which give Bob _the ability_ to withdraw up to a certain amount from the multisig.
- Because Bob _can_ get his funds at any time using his unbreakable commitment from you, you complete a new payment to him every time you send a new signature.

![alt text](https://github.com/connext/spacefold/blob/master/public/BasicChannel.png?raw=true)

Connext extends this concept in a couple of ways ways:

1. Updates within the channel can have any arbitrary conditionality to them. This means you could make your payments conditional upon Bob providing a proof of his work, or based on some real world event, or even based on the outcome of a chess game.

2. More importantly: the above paradigm requires you to deploy a new multisig with each new person you transact with. Using the conditionality described above, Connext instead lets you use your channel with Bob to atomically interact with anyone that Bob also has a channel with. For instance, you pay Bob $1, who pays Charlie $0.9999 (Bob takes a microfee), who pays Danielle \$0.9998 (Charlie takes a microfee).

There's a lot more information available publicly on state channels, here are some great resources:

- [State channels for babies](https://medium.com/connext/state-channels-for-babies-c39a8001d9af)
- [Counterfactual for dummies](https://medium.com/blockchannel/counterfactual-for-dummies-part-1-8ff164f78540)
- [EthHub](https://docs.ethhub.io/ethereum-roadmap/layer-2-scaling/state-channels/)