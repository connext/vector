# ↗️ Vector

Vector is an ultra-simple, flexible state channel protocol and implementation.

At Connext, our goal is to build the cross-chain routing and micropayment layer of the decentralized web. Vector sits on top of Ethereum, evm-compatible L2 blockchains, and other turing-complete chains, and enables instant, near free transfers that can be routed across chains and over liquidity in any asset.

Out of the box, it supports the following features:

- 💸 Conditional transfers with arbitrary generality routed over one (eventually many) intermediary nodes.
- 🔀 Instant cross-chain and cross-asset transfers/communication. Works with any evm-compatible chain.
- 🔌 Plug in support for non-evm turing complete chains.
- 💳 Simplified deposits/withdraw, just send funds directly to the channel address from anywhere and use your channel as a wallet!
- ⛽ Native e2e gas abstraction for end-users.
- 💤 Transfers to offline recipients.

This monorepo contains a number of packages hoisted using lerna. Documentation for each package can be found in their respective readme, with some helpful links in [Architecture](#architecture) below.

Contents:

- [Quick Start](#quick-start)
- [Configuration API](#configuration-api)
- [Architecture and Module Breakdown](#architecture-and-module-breakdown)
- [Interacting with a vector node](#interacting-with-a-vector-node)
- [Development and Running Tests](#development-and-running-tests)
- Deploying Vector to Production // TODO

## Quick start

**Prerequisites:**

- `make`: Probably already installed, otherwise install w `brew install make` or `apt install make` or similar.
- `jq`: Probably not installed yet, install w `brew install jq` or `apt install jq` or similar.
- `docker`: See the [Docker website](https://www.docker.com/) for installation instructions.

To start, clone & enter the Vector repo:

```bash
git clone https://github.com/connext/vector.git
cd vector
```

To build everything and deploy a Vector node in dev-mode, run the following:

```bash
make start

# view the node's logs
bash ops/logs.sh node
```

That's all! But beware: the first time `make start` is run, it will take a very long time (maybe 10 minutes, depends on your internet speed) but have no fear: downloads will be cached & most build steps won't ever need to be repeated again so subsequent `make start` runs will go much more quickly. Get this started asap & browse the rest of the README while the first `make start` runs.

By default, Vector will launch using two local chains (ganache with chain id `1337` and `1338`) but you can also run a local Vector stack against a public chain (or multiple chains!) such as Rinkeby. To do so, edit the `chainProviders` and `chainAddresses` fields of `config.json` according to the chain you want to support.

Note: this will start a local Connext node pointed at a remote chain, so make sure the mnemonic used to start your node is funded in the appropriate native currencies and supported chain assets. By default, the node starts with the account:

```node
mnemonic: "candy maple cake sugar pudding cream honey rich smooth crumble sweet treat";
privateKey: "0xc87509a1c067bbde78beb793e6fa76530b6382a4c0241e5e4a9ec0a0f44dc0d3";
address: "0x627306090abaB3A6e1400e9345bC60c78a8BEf57";
```

To apply updates to `config.json`, you'll need to restart your vector node with `make restart`.

(`make start`/`make restart` are aliases for `make start-node`/`make restart-node`)

Four different Vector stacks are supported:

- `global`: standalone messaging service (+ EVMs in dev-mode)
- `node`: vector node + database
- `router`: vector node + router + database
- `duet`: 2x node/db pairs, used to test one-on-one node interactions
- `trio`: 2x node/db pairs + 1x node/router/db , used to test node interactions via a routing node.

For any of these stacks, you can manage them with:

- `make ${stack}` eg `make duet` builds everything required by the given stack
- `make start-${stack}` eg `make start-router` will start up the router stack.
- `make stop-${stack}` stops the stack
- `make restart-${stack}` stops the stack if it's running & starts it again
- `make test-${stack}` runs unit tests against some stack. It will build & start the stack if that hasn't been done already.

## Configuration Layout

The `node` and `router` stacks are configurable via the `config-node.json` and `config-router.json` files respectively. Note that the `duet` and `trio` stacks are designed exclusively for development/testing so these are not configurable.

There is an additional `config-prod.json` file that can apply to either the node or router but not both. The `config-prod.json` file contains your domain name and, because it's _not_ tracked by git, it's a good place to put overrides for secret values like API keys. A prod-mode deployment using a domain name w https must be exposed on port 443, therefore only a single prod-mode stack can run on a given machine at a time.

### Node Configuration API

`config-node.json` contains the default configuration for the `node` stack: `make start-node`.

Any of these values can be overwritten by providing the same key with a new value to `config-prod.json`.

**Node Config Keys:**

- `adminToken` (type: `string`): Currently, this is only used during development to protect a few admin endpoints eg to reset the database between tests. If/when we add admin-only features in prod, they will only be accessible to those who provide the correct adminToken.
- `authUrl` (type: `string`): The url used to authenticate with the messaging service (TODO: merge this with the nats url?)
- `chainAddresses` (type: `object`): Specifies the addresses of all relevant contracts, keyed by `chainId`.
- `chainProviders` (type: `object`): Specifies the URL to use to connect to each chain's provider, keyed by `chainId`
- `logLevel` (type: `string`): one of `"debug"`, `"info"`, `"warn"`, `"error"` to specify the maximum log level that will be printed.
- `mnemonic` (type: `string`): Optional. If provided, the node will use this mnemonic. If not provided, the node will use a hard coded mnemonic with testnet funds in dev-mode (production=false). If not provided in prod, docker secrets will be used to manage the mnemonic; this is a much safer place to store a mnemonic that eg holds mainnet funds.
- `natsUrl` (type: `string`): The URL of the messaging service (TODO: merge with auth url?)
- `port` (type: `number`): The port number on which the stack should be exposed to the outside world.
- `redisUrl` (type: `string`): The URL of the redis instance used to negotiate channel-locks.

### Router Configuration API

`config-router.json` contains the default configuration for the `router` stack's router module. The router stack also contains a node and this node's default configuration is also pulled from `config-node.json`.

The router's node can be configured by adding any of the keys in `config-node.json` to `config-router.json` (any values in `config-router.json` will take precedence). This strategy is useful if you want to run tests on a router & node stack running on the same machine.

Any config values for either the router or the node can be overwritten by adding the same key with a new value to `config-prod.json`. This is a good strategy if this machine will only be running a routing node bc these prod config changes will also be applied to a `node` stack thats running on the same machine.

**Router Config Keys:**

- `allowedSwaps` (type: `object`): Specifies which swaps are allowed & how swap rates are determined.
- `nodeUrl` (type: `string`): The URL of the node instance used to power the router's channels.
- `port` (type: `number`): The port number on which the stack should be exposed to the outside world.
- `rebalanceProfiles` (type: `object`): Specifies the thresholds & target while collateralizing some `assetId` on some `chainId`.

### Prod Configuration API

Changes to `config-prod.json` aren't tracked by git so this is a good place to store secret API keys, etc.

Be careful, changes to this file will be applied to both `node` & `router` stacks running on this machine.

**Prod Config Keys:**

- `awsAccessId` (type: `string`): An API KEY id that specifies credentials for a remote AWS S3 bucket for storing db backups
- `awsAccessKey` (type: `string`): An API KEY secret that to authenticate on a remote AWS S3 bucket for storing db backups.
- `domainName` (type: `string`): If provided, https will be auto-configured & the stack will be exposed on port 443.
- `production` (type: `boolean`): Enables prod-mode if true. Implications of this flag:
  - if `false`, ops will automatically build anything that isn't available locally before starting up a given stack. If `true`, nothing will be built locally. Instead, all images will be pulled from docker hub.
  - if `false`, the `global` stack will start up 2 local testnet evm.
  - Mnemonic handling is affected, see docs for the `mnemonic` key in node config.

## Architecture and Module Breakdown

Vector uses a layered-approach to compartmentalize risk and delegate tasks throughout protocol usage. In general, lower layers are not context-aware of higher level actions. Information flows downwards through call params and upwards through events. The only exception to this are services, which are set up at the services layer and passed down to the protocol directly.

![alt](https://i.ibb.co/wRnskD4/Vector-System-Architecture-3.png)

You can find documentation on each layer in its respective readme:

- [Contracts](https://github.com/connext/vector/blob/master/modules/contracts/) - holds user funds and disburses them during a dispute based on commitments provided by channel parties.
- [Protocol](https://github.com/connext/vector/tree/master/modules/protocol/) - creates channels, generates channel updates/commitments, validates them, and then synchronizes channel state with a peer.
- [Engine](https://github.com/connext/vector/blob/master/modules/engine/) - implements default business logic for channel updates and wraps the protocol in a JSON RPC interface.
- [Server-Node](https://github.com/connext/vector/blob/master/modules/server-node/) - sets up services to be consumed by the engine, spins up the engine, and wraps everything in REST and gRPC interfaces.
- [Router](https://github.com/connext/vector/blob/master/modules/router/) - consumes the server-node interface to route transfers across multiple channels (incl across chains/assets)

Note that the engine and protocol are isomorphic. Immediately after the core implementation is done, we plan to build a `browser-node` implementation which sets up services in a browser-compatible way and exposes a direct JS interface to be consumed by a dApp developer.

## Interacting with a vector node

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

Once you have the above trio set up, you can interact with your nodes via a REST interface. We've documented [example requests](https://github.com/connext/vector/tree/master/modules/server-node/examples) in the server-node module. If you're developing with VSCode, there are several REST client plugins available in the marketplace that you can use to make these queries _directly from the examples_.

First, set up your channels from Alice -> Roger and Roger -> Bob (in [1_Setup](https://github.com/connext/vector/blob/master/modules/server-node/examples/1-setup.http)). Note `aliceUrl` is the internal URL that Carol has access to on the Docker network. In these examples, Carol and Dave are requesting Roger to set up the channel with them so that they can be the "Bob" within the channel, which lets them deposit by transferrring directly into the channel address.:

```
### Node -> Carol
POST {{carolUrl}}/request-setup
Content-Type: application/json

{
  "aliceUrl": "http://roger:8000",
  "chainId": "{{chainId}}",
  "timeout": "36000"
}

### Node -> Dave
POST {{daveUrl}}/request-setup
Content-Type: application/json

{
  "aliceUrl": "http://roger:8000",
  "chainId": "{{chainId}}",
  "timeout": "36000"
}
```

Then, send an Eth deposit to Alice's channel onchain. This can be done by connecting Metamask to your local EVM at `http://localhost:8545` and sending a transfer directly to the `channelAddress`, at any time, regardless of either channel participant's liveness status. A convenient way to do this using HTTP JSON-RPC calls is with a POST request:

```
# Send a transaction to {{channelAddress}} for 100000000000000000 Wei
POST http://localhost:8545
Content-Type: application/json

{
  "jsonrpc":"2.0",
  "method":"eth_sendTransaction",
  "params":[{
    "from": "0x627306090abaB3A6e1400e9345bC60c78a8BEf57",
    "to": "{{channelAddress}}",
    "value": "0x16345785d8a0000",
    "data": "0x0"
  }],
  "id":1
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
POST {{aliceUrl}}/hashlock-transfer/create
Content-Type: application/json

{
  "conditionType": "HashlockTransfer",
  "channelAddress": "{{aliceNodeChannel}}",
  "amount": "{{ethAmount}}",
  "assetId": "0x0000000000000000000000000000000000000000",
  "details": {
    "lockHash": "{{lockHash}}"
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
POST {{bobUrl}}/hashlock-transfer/resolve
Content-Type: application/json

{
  "channelAddress": "{{aliceBobChannel}}",
  "routingId": "{{routingId}}",
  "preImage": "{{preImage}}"
}
```

### Using the Server Node JS Client

The above HTTP requests are wrapped into a JS [client](./modules/utils/src/serverNode.ts). This can be installed into a standalone Node.js program by installing the `@connext/vector-utils` package. Minimally, the client is instantiated like so (assuming a local setup similar to `make start-node` or `make start-duet`):

```ts
import { RestServerNodeService } from "@connext/vector-utils";
import pino from "pino";

const alice = await RestServerNodeService.connect("http://localhost:8001", { 1337: "http://localhost:8545" }, pino());
```

The client has wrapper methods for the `server-node`'s REST interface, which implement the interface [`IServerNodeService`](./modules/utils/src/serverNode.ts).

#### Event Subscriptions

To subscribe to the `server-node`'s event emitter, the JS client uses webhooks. A program that wants to listen for the `server-node`'s events needs to implement an HTTP server that can accept POST requests which the `server-node` POSTs to when events are generated. The JS client uses a mapping of [EVTs](https://www.evt.land) which should be posted to when the HTTP request is received to allow for more powerful filtering capabilities behind an easy to use interface.

A full example can be found in the implementation of the [router module](./modules/router/src), here are relevant snippets:

```ts
import { Evt } from "evt";
import fastify from "fastify";
import { RestServerNodeService } from "@connext/vector-utils";
import {
  ConditionalTransferCreatedPayload,
  ConditionalTransferResolvedPayload,
  EngineEvents,
} from "@connext/vector-types";

// using fastify as the web server
const server = fastify();

// configure event subscriptions
const serverBase = `http://localhost:3000`; // this server
// callback paths
const conditionalTransferCreatedPath = "/conditional-transfer-created";
const conditionalTransferResolvedPath = "/conditional-transfer-resolved";
const evts = {
  [EngineEvents.CONDITIONAL_TRANSFER_CREATED]: {
    evt: Evt.create<ConditionalTransferCreatedPayload>(),
    url: `${routerBase}${conditionalTransferCreatedPath}`,
  },
  [EngineEvents.CONDITIONAL_TRANSFER_RESOLVED]: {
    evt: Evt.create<ConditionalTransferResolvedPayload>(),
    url: `${routerBase}${conditionalTransferResolvedPath}`,
  },
  [EngineEvents.SETUP]: {},
  [EngineEvents.WITHDRAWAL_CREATED]: {},
  [EngineEvents.WITHDRAWAL_RESOLVED]: {},
  [EngineEvents.WITHDRAWAL_RECONCILED]: {},
  [EngineEvents.DEPOSIT_RECONCILED]: {},
};

const logger = pino();
let node: RestServerNodeService | undefined;
server.addHook("onReady", async () => {
  // asynchronously connect to server node
  node = await RestServerNodeService.connect(
    "http://localhost:8001",
    { 1337: "http://localhost:8545" },
    logger.child({ module: "RestServerNodeService" }), // namespace logs by module
    evts, // event subscription config
  );
});

// endpoints to receive server-node events
server.post(conditionalTransferCreatedPath, async (request, response) => {
  // post to the EVT that we pass into the server-node client
  evts[EngineEvents.CONDITIONAL_TRANSFER_CREATED].post(request.body as ConditionalTransferCreatedPayload);
  return response.status(200).send({ message: "success" });
});

server.post(conditionalTransferResolvedPath, async (request, response) => {
  evts[EngineEvents.CONDITIONAL_TRANSFER_RESOLVED].post(request.body as ConditionalTransferResolvedPayload);
  return response.status(200).send({ message: "success" });
});

await node.on(
  EngineEvents.CONDITIONAL_TRANSFER_CREATED,
  async data => {
    console.log(`Received conditional transfer: ${JSON.stringify(data)}`);
  },
  data => data.transfer.initiator === "indraABCD", // can filter on the data here
);
```

#### Indexed Engines

To enable the SDK to work with an indexed engine, you can specify an `index` param in the `connect` method.

### Managing Multiple Private Keys

In most cases, the `server-node` manages a single private key and signs all channel operations with this key. In some cases, users will want the ability to manage multiple private keys and multiple instances of `engine`s`.

This functionality is possible in the `server-node` by deriving private keys from the mnemonic in the `server-node`'s config ([more info](https://medium.com/@wolovim/ethereum-201-hd-wallets-11d0c93c87f7)). By default, the `server-node` creates an engine at the index path "0" for convenience.

Below is an example of creating a new Engine instance. The `index` param is an integer between 0 and 2147483647 (2\*\*32):

```
POST {{aliceUrl}}/node
Content-Type: application/json

{
  "index": 1234
}
```

The response to this request contains a `signerAddress` and `publicIdentifier`. Additional calls to the server node must include the `publicIdentifier` to specify which `engine` to use.

## Development and Running Tests

You can build the whole stack by running `make`.

Running tests:

- Unit tests are run using `make test-{{$moduleName}}`.
- Two party integration tests are run using `make start-duet` and then `make test-duet`
- Three party (incl routing node) itests are run using `make start-trio` and then `make test-trio`
