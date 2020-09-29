# ↗️ Vector

Vector is an ultra-simple, flexible state channel protocol and implementation.

At Connext, our goal is to build the cross-chain routing and micropayment layer of the decentralized web. Vector sits on top of Ethereum, evm-compatible L2 blockchains, and other turing-complete chains, and enables instant, near free transfers that can be routed across chains and over liquidity in any asset.

Out of the box, it supports the following features:

- 💸 Conditional transfers with arbitrary generality routed over one (eventually many) intermediary nodes.
- 🔀 Instant cross-chain and cross-asset transfers/communication. Works with any evm-compatible chain.
- 🔌 Plug in support for non-evm turing complete chains.
- 💳 Simplified deposits, just send funds directly to the channel address from anywhere!
- 🦄 Use a channel as a wallet - call arbitrary contract functions (e.g. Uniswap!) using channel funds.
- ⛽ Native e2e gas abstraction for end-users.
- 💤 Transfers to offline recipients.

This monorepo contains a number of packages hoisted using lerna. Documentation for each package can be found in their respective readme, with some helpful links in [Architecture](#architecture) below.

Contents:

- [Quick Start](#quick-start)
- [Architecture and Module Breakdown](#architecture-and-module-breakdown)
- [Development and Running Tests](#development-and-running-tests)
- Configuring Vector // TODO
- Deploying Vector to Production // TODO

## Quick Start

To quickly get a working, entirely local dev environemnt, first spin up a `routing-node`.

```
git clone git@github.com:connext/vector.git
cd vector
make start-node
```

Once this is complete, you can spin up one or many non-routing `server-node`s by doing

```
make start
```

//TODO

## Architecture and Module Breakdown

Vector uses a layered-approach to compartmentalize risk and delegate tasks throughout protocol usage. In general, lower layers are not context-aware of higher level actions. Information flows downwards through call params and upwards through events. The only exception to this are services, which are set up at the services layer and passed down to the protocol directly.

![alt](https://i.ibb.co/wRnskD4/Vector-System-Architecture-3.png)

You can find documentation on each layer in its respective readme:

- [Contracts](https://github.com/connext/vector/blob/master/modules/contracts/README.md) - holds user funds and disburses them during a dispute based on commitments provided by channel parties.
- [Protocol](https://github.com/connext/vector/tree/master/modules/protocol/README.md) - creates channels, generates channel updates/commitments, validates them, and then synchronizes channel state with a peer.
- [Engine](https://github.com/connext/vector/blob/master/modules/engine/README.md) - implements default business logic for channel updates and wraps the protocol in a JSON RPC interface.
- Server-Node - sets up services to be consumed by the engine, spins up the engine, and wraps everything in REST and gRPC interfaces.
- [Router](https://github.com/connext/vector/blob/master/modules/router/README.md) - consumes the server-node interface to route transfers across multiple channels (incl across chains/assets)

Note that the engine and protocol are isomorphic. Immediately after the core implementation is done, we plan to build a `browser-node` implementation which sets up services in a browser-compatible way and exposes a direct JS interface to be consumed by a dApp developer.

## Development and Running Tests

You can build the whole stack by running `make`.

Running tests:

- Unit tests are run using `make test-{{$moduleName}}`.
- Two party integration tests are run using `make start-duet` and then `make test-duet`
- Three party (incl routing node) itests are run using `make start-trio` and then `make test-trio`
