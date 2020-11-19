# Browser Node Quick Start

This quick start will guide you through getting to a simple e2e transfer flow running between two peers running [browser nodes](https://github.com/connext/vector/tree/master/modules/browser-node) that runs through an intermediary routing node.

We assume you're starting with an existing JS application that runs in the browser.

## Local Development With Local Blockchains

### Spinning Up a Trio Stack Locally

View server node docs to [spin up a trio stack](./serverNode/#spinning-up-a-trio-stack-locally).

This gives you a router to interact with and non-router nodes to test transfers to and from, as well as local EVM chains and messaging services.

### Spinning Up the iframe App Locally

The iframe app will securely store the node's private keys in a separate browser window which's storage cannot be accessed by other windows, i.e. dapps which integrate the browser node.

Run the app by running the command:

```bash
make start-iframe-app
```

The iframe app is configured by default to communicate with the local stack and EVM chains that are spun up with `make start-trio`. There is a config file generated at the root called `browser.config.json` which uses the same configuration API as [documented here]("../node/configure/#node-configuration-api).

The iframe app runs by default at `http://localhost:3030`.

### Application Installation and Instantiation

You can install the `browser-node` into a React (or similar) application [via npm](https://www.npmjs.com/package/@connext/vector-browser-node):

```bash
npm i @connext/vector-browser-node @connext/vector-utils @connext/vector-types
```

Somewhere in your page load code, you can instantiate the browser node using the `connect` call, specifying the local iframe app:

```ts
const client = await BrowserNode.connect({
  iframeSrc: "http://localhost:3030",
  logger: pino(),
});
```

Once this is connected, the `client` has the interface documented in the [node API docs]("../reference/nodeAPI/"). The steps to follow for basic operation are:

- Setup a channel with your local router.
- Deposit funds into your channel, transfer, and withdraw.

## Local Development With Remote Testnets

If you do not want/need to run a local blockchain/router/messaging service, you can skip the steps above and jump straight to "Application Installation and Instantiation". The connect call will instead be:

```ts
const client = await BrowserNode.connect({
  logger: pino(),
});
```

This will connect to our hosted iframe app at `https://wallet.connext.network` which is configured to communicate to the testnets and mainnets that we currently support. You can setup channels with router nodes from our [list of hosted nodes]("../reference/hostedNodes/).