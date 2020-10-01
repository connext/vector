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

- [Architecture and Module Breakdown](#architecture-and-module-breakdown)
- [Quick Start](#quick-start)
- [Development and Running Tests](#development-and-running-tests)
- Configuring Vector // TODO
- Deploying Vector to Production // TODO

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

## Quick Start

This quick start will guide you through getting to a simple e2e transfer flow between two peers running [server-nodes](https://github.com/connext/vector/tree/master/modules/server-node) (Alice, Bob) that is routed through one intermediary routing node (Roger).

Prerequisites:
- `make`: Probably already installed, otherwise install w `brew install make` or `apt install make` or similar.
- `jq`: Probably not installed yet, install w `brew install jq` or `apt install jq` or similar.
- `docker`: sadly, Docker is kinda annoying to install. See [website](https://www.docker.com/) for instructions.

First, clone the repo:
```bash
git clone git@github.com:connext/vector.git
cd vector
```
Then, run:
```bash
make start-trio
```

The above command will spin up three server-nodes, one with an attached router in dev-mode. Note that in dev-mode, chain and db data will not be persisted between restarts. To run in prod mode, you can spin up a routing node with `make start-router` and non-routing server-nodes with `make start-node`. We have a guide on prod-mode deployments and configuration coming soon!

Once you have the above trio set up, you can interact with your nodes via a REST interface. We've documented [example requests](https://github.com/connext/vector/tree/master/modules/server-node/examples) in the server-node module. If you're developing with VSCode, there are several REST client plugins available in the marketplace that you can use to make these queries *directly from the examples*.

First, set up your channels from Alice -> Roger and Roger -> Bob (in [1_Setup](https://github.com/connext/vector/blob/master/modules/server-node/examples/1-setup.http)):

```
### Node -> Alice
POST {{nodeUrl}}/setup
Content-Type: application/json

{
  "counterpartyIdentifier": "{{alicePublicIdentifier}}",
  "chainId": "{{chainId}}",
  "timeout": "36000"
}

### Node -> Bob
POST {{nodeUrl}}/setup
Content-Type: application/json

{
  "counterpartyIdentifier": "{{bobPublicIdentifier}}",
  "chainId": "{{chainId}}",
  "timeout": "36000"
}
```

Then, send an Eth deposit to Alice's channel onchain (in [2_deposit](https://github.com/connext/vector/blob/master/modules/server-node/examples/2-deposit.http)):
```
POST {{aliceUrl}}/send-deposit-tx
Content-Type: application/json

{
  "channelAddress": "{{aliceNodeChannel}}",
  "amount": "{{ethAmount}}",
  "assetId": "0x0000000000000000000000000000000000000000"
}
```

To add this to Alice's offchain balance, you need to wait for the tx to be mined and then call:
```
POST {{aliceUrl}}/deposit
Content-Type: application/json

{
  "channelAddress": "{{aliceNodeChannel}}",
  "assetId": "0x0000000000000000000000000000000000000000"
}
```

Then, create a transfer between Alice and Bob through Roger (in [3_transfer](https://github.com/connext/vector/blob/master/modules/server-node/examples/3-transfer.http)):
```
POST {{aliceUrl}}/linked-transfer/create
Content-Type: application/json

{
  "conditionType": "LinkedTransfer",
  "channelAddress": "{{aliceNodeChannel}}",
  "amount": "{{ethAmount}}",
  "assetId": "0x0000000000000000000000000000000000000000",
  "details": {
    "linkedHash": "{{linkedHash}}"
  },
  "routingId": "{{routingId}}",
  "recipient": "{{bobPublicIdentifier}}",
  "meta": {
    "hello": "world"
  }
}
```

Lastly, unlock the transfer for Bob to get his funds:
```
POST {{bobUrl}}/linked-transfer/resolve
Content-Type: application/json

{
  "channelAddress": "{{aliceBobChannel}}",
  "routingId": "{{routingId}}",
  "preImage": "{{preImage}}"
}
```

## Development and Running Tests

You can build the whole stack by running `make`.

Running tests:

- Unit tests are run using `make test-{{$moduleName}}`.
- Two party integration tests are run using `make start-duet` and then `make test-duet`
- Three party (incl routing node) itests are run using `make start-trio` and then `make test-trio`
