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

## Supported Functionality
