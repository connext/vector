# Quick Start

This quick start will guide you through getting to a simple e2e transfer flow between two peers running [server-nodes](https://github.com/connext/vector/tree/master/modules/server-node) (Carol, Dave) that is routed through one intermediary routing node (Roger).

## Spinning Up the Stack Locally

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

## Creating a Channel

Once you have the above trio set up, you can interact with your nodes via a REST interface. We've documented [example requests](https://github.com/connext/vector/tree/master/modules/server-node/examples) in the server-node module. If you're developing with VSCode, there are several REST client plugins available in the marketplace that you can use to make these queries _directly from the examples_.

First, set up your nodes (in [0_config](https://github.com/connext/vector/blob/master/modules/server-node/examples/0-config.http)) on the servers to register signers and create the engines.

```
### Node -> Carol
POST {{carolUrl}}/node
Content-Type: application/json

{
  "index": 0
}

### Node -> Dave
POST {{daveUrl}}/node
Content-Type: application/json

{
  "index": 0
}
```

Then, set up your channels from Carol -> Roger and Roger -> Carol (in [1_Setup](https://github.com/connext/vector/blob/master/modules/server-node/examples/1-setup.http)). Note `aliceUrl` is the internal URL that Carol has access to on the Docker network. In these examples, Carol and Dave are requesting Roger to set up the channel with them so that they can be the "Bob" within the channel, which lets them deposit by transferrring directly into the channel address.:

```
### Node -> Carol
POST {{carolUrl}}/request-setup
Content-Type: application/json

{
  "aliceUrl": "http://roger:8000",
  "chainId": "{{chainId}}",
  "timeout": "36000",
  "publicIdentifier": "{{carolIdentifier}}"
}

### Node -> Dave
POST {{daveUrl}}/request-setup
Content-Type: application/json

{
  "aliceUrl": "http://roger:8000",
  "chainId": "{{chainId}}",
  "timeout": "36000",
  "publicIdentifier": "{{daveIdentifier}}"
}
```

## Depositing Into a Channel

Then, send an Eth deposit to Carol's channel onchain. This can be done by connecting Metamask to your local EVM at `http://localhost:8545` and sending a transfer directly to the `channelAddress`, at any time, regardless of either channel participant's liveness status. A convenient way to do this using HTTP JSON-RPC calls is with a POST request:

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

To add this to Carol's offchain balance, you need to wait for the tx to be mined and then call:

```
POST {{carolUrl}}/deposit
Content-Type: application/json

{
  "channelAddress": "{{carolNodeChannel}}",
  "assetId": "0x0000000000000000000000000000000000000000",
  "publicIdentifier": "{{carolIdentifier}}"
}
```

## Making a Transfer

Then, create a transfer between Carol and Dave through Roger (in [3_transfer](https://github.com/connext/vector/blob/master/modules/server-node/examples/3-transfer.http)):

```
POST {{carolUrl}}/hashlock-transfer/create
Content-Type: application/json

{
  "conditionType": "HashlockTransfer",
  "channelAddress": "{{carolNodeChannel}}",
  "amount": "{{ethAmount}}",
  "assetId": "0x0000000000000000000000000000000000000000",
  "details": {
    "lockHash": "{{lockHash}}"
  },
  "routingId": "{{routingId}}",
  "recipient": "{{davePublicIdentifier}}",
  "meta": {
    "hello": "world"
  },
  "publicIdentifier": "{{carolIdentifier}}"
}
```

Lastly, unlock the transfer for Bob to get his funds:

``` http
POST {{daveUrl}}/hashlock-transfer/resolve
Content-Type: application/json

{
  "channelAddress": "{{daveNodeChannel}}",
  "routingId": "{{routingId}}",
  "preImage": "{{preImage}}",
  "publicIdentifier": "{{daveIdentifier}}"
}
```
