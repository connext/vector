# Browser Node Quick Start

This quick start will guide you through getting to a simple e2e transfer flow running between two peers running [browser nodes](https://github.com/connext/vector/tree/master/modules/browser-node) that runs through an intermediary routing node.

We assume you're starting with an existing JS application that runs in the browser.

## Spinning Up a Router Locally

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
make start-router
```

The above command will spin up a routing node in `dev-mode` along with some local services for messaging and auth. It will also create two local blockchains (at chainIds `1337` and `1338` respectively) and then will deploy the Connext contracts to those chains. 

## Installation and Instantiation

You can install the `browser-node` [via npm](https://www.npmjs.com/package/@connext/vector-browser-node):

```bash
npm i @connext/vector-browser-node --save
```

You'll also probably want the `vector-utils` package.

```bash
npm i @connext/vector-utils --save
```

Instantiating the node takes in the following constructor params:

- `chainProviders`: A provider URL for whatever chain(s) you want to connect to. E.g. Infura, Geth node in VPC, etc. Indexed by [chainId](https://chainId.network).
- `chainAddresses`: An object containing Connext contract addresses also indexed by `chainId`.
- `signer`: A ChannelSigner, which can be created using the `vector-utils` package and a private key.
- `messagingUrl`: Local or remote URL access to a messaging service. In prod-mode, this is automatically defaulted to a global service.
- `logger`: A [pino](https://getpino.io/#/) logger.
