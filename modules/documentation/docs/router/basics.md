# Basics

Router is an automated module that allows a server-node to act as an intermediary in hopped transactions between different peers in a network. For now, nodes that have the router enabled, i.e. routing nodes can only forward transfers to non-routing peers. Eventually, this routing module can be expanded to allow routing nodes to route value to other routing nodes, thereby creating a fully-decentralized state channel network.

## Responsibilities

Router consumes the server-node gRPC interface to do the following:

- Listen to incoming events from the node for inbound transfers.
- Parse the transfer metadata to find routing information (recipient, chainId, assetId, requireOnline, etc.).
- Look up the recipient's channel using the above info.
- Check that the recipient's channel has enough collateral. If not, send a deposit to collateralize the channel and wait for it to be completed.
    - As part of resolving transfers, the router will also reclaim collateral from channels.
- Dispatch the transfer. If the transfer fails and the transfer requires that the recipient is online, then hard error and cancel the sender side transfer too. Else, store the transfer and wait for the recipient to come back online.
- When a recipient comes online, the node emits an isAlive event for that channel. Router should catch isAlive events and complete all pending transfers to the recipient.

Note that validation around allowed transfer types all happens in the node itself.

## Testing Deployed Router

So you've deployed a router -- that's great! Now it's time to check if it's all done correctly. If you don't have your own setup ready to go, you can use the modules within vector to spin up a local UI pointed at your deployed router:

1. Create a `browser.config.json` if it does not exist:

```sh
> make config
```

2. Update your `browser.config.json` to have the correct `chainProviders`, `chainAddresses`, and `messagingUrl` for your chain. For example, if your router is configured for rinkeby:

```json
{
  "adminToken": "cxt1234",
  "chainAddresses": {
    "4": {
      "channelFactoryAddress": "0x00F89bFDFD0dECa323793C3d3d2aED2d3ac9FAbD",
      "testTokenAddress": "0x07f2B2b021cF4F31bFBa79d77F39EA7Fb599213b",
      "transferRegistryAddress": "0x78B498f3Bc35EeCEb7fA2aC80206652c4138721f"
    }
  },
  "chainProviders": {
    "4": "https://rinkeby.infura.io/v3/your-infura-secret"
  },
  "logLevel": "info",
  "messagingUrl": "https://messaging.connext.network",
  "production": false
}
```

3. Spin up the `iframe-app`:

```sh
> make start-iframe-app
```

4. Spin up the `test-ui`:

```sh
> make start-test-ui
```

Note: If you are using an ad blocker, it may block the connection to the router. You would see an error like this:

```sh
transport.ts:70 WebSocket connection to 'wss://messaging.connext.network/ws-nats' failed: Unknown reason
```

From there, you can plug in your routers public identifier, and test out all the functionality.
