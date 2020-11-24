# Vector Protocol

Protocol is where the core Vector framework is defined. Protocol takes in params via method calls, uses them to make updates to its replicated state with a channel peer, and stores resulting commmitments in store.

Contents:

- [Developing and Running Tests](https://github.com/connext/vector/tree/master/modules/protocol#developing-and-running-tests)
- [Core Principles](https://github.com/connext/vector/tree/master/modules/protocol#core-principles)
- [Sync Protocol](https://github.com/connext/vector/tree/master/modules/protocol#sync)
- [Update Types](https://github.com/connext/vector/tree/master/modules/protocol#update-types)

## Developing and Running Tests

In `~/vector` (root), run:

- `make protocol` to build the protocol
- `make test-protocol` to run the module tests

## Core Principles

Vector aims to be an _extremely simple_ state channel protocol. Both parties follow a single flow to make updates:

1. **Leader Election** -- this is done using a distributed lock implementation. Peers queue updates on the lock and execute them serially.
2. **Update Generation** -- a proposed update is generated and signed by the sender in-memory
3. **Synchronization** -- the sender's update is dispatched over the wire. Receiver validates the update, merges the update with their channel, stores the channel, and then acks. Sender receives the ack and stores.

We use the following design principles:

- Vector uses leader election -> consensus to manage updates to both peers' replicated stores. To keep things simple (at the cost of some additional messaging overhead), we have chosen _not_ to use a CRDT + turn taking pattern like those seen in [StateChannels](https://docs.statechannels.org).
- All updates in a channel fall into one of four types of operations:

  1. [`setup`](#setup) creates a new channel between two peers
  2. [`deposit`](#deposit) reconciles pending onchain deposits with offchain balance
  3. [`create`](#create) creates a new conditional transfer with the peer
  4. [`resolve`](#resolve) resolves a previously created conditional transfer

- All updates are single-round-trip and associated with a monotonically incrementing nonce.
- The protocol does _not_ make assumptions about message delivery to the counterparty. Each update additionally contains information about the `n-1` (previous) update. This means that if, for whatever reason, the counterparty failed to properly synchronize the last update, it is possible for them "recover" and do so within the single round trip of the next update. In other words, the protocol will **always** recover if a peer's state gets out of sync.
- All generated updates are matched to corresponding validators, that ensure that the peer's updates were generated and signed correctly.
- The protocol is **not** where the RPC interface lives, which instead exists at the [engine](../engine/README.md) layer. This is done to allow extra-protocol functions (i.e. saving withdrawal commitments) to be executed via a channel provider, as well as allowing the RPC interface to be more usecase driven (i.e. including a `chan_withdraw` method)
- The protocol allows for generic transfer logic governed by the onchain `TransferDefinitions` included in the `TransferRegistry`. The protocol is unaware of the transfer specifics, and relies on the onchain logic to provide the correct state and resolver encodings, validate the created state, and correctly resolve the balances.

## Sync Protocol

At the core of Vector lies `sync`. Unlike other state channel systems, there is only a **single** protocol -- `sync` is used both when a sender wants to propose a new update to the replicated state, and _also_ when peer state has diverged. Because updates are monotonic (nonce += 1), there are only a very limited number of cases within which party states possibly diverge.

For this reason, `sync` takes a higher degree of control over message delivery than other state channel protocols do. Outbound messages are retried on a timer if they fail, inbound ones are idempotent. Higher-nonced inbound messages are checked against the `ChannelState` latest nonce and dropped if they are duplicates, or saved to store if they aren't.

The protocol can be visualized as follows:

<img src="https://i.ibb.co/nc8b6dZ/sync-3.png" alt="sync-3" border="0">

## Update Types

All channel updates fall into one of 4 types. Each update type is responsible for generating and storing one [double-signed commitment](https://github.com/connext/vector/blob/master/modules/contracts/README.md#commitments).

Note that there is no specific update for `withdraw`. Instead, withdrawals can be constructed in an easy and generalizeable way using `create` and `resolve`. [TODO: INSERT LINK HERE](here.md)

### Setup

The setup update is responsible for creating a channel commitment at nonce 1 and establishing several channel constants:

- `channelAddress`: the CREATE2 address at which a proxy to the `ChannelMastercopy.sol` contract will be deployed
- `alice` / `bob`: the channel participants, which is a high-fidelity vs. low-fidelity participant in the channel. The assignment of these roles plays a critical role in channel deposits.
- `timeout`: the time (in seconds) channel participants get in each of the dispute phases

The `setup` update allows both participants to safely dispute a channel and reclaim funds from the multisig even if initial onchain deposits were never reconciled into the channel balance. For example, imagine a channel `setup` commitment is generated and Alice deposits into the channel then generates a single-signed commitment that Bob never countersigns. Using the double-signed `setup` commitment, Alice can safely dispute and defund the channel.

### Deposit

An offchain `deposit` update is designed to reconcile deposits that have been successfully mined onchain (either by calling the `depositA` function for `alice`, or simply sending funds to the multisig for `bob`) with the offchain balance.

To do this safely, the following must occur:

1. The update initiator's balance must be incremented by the deposit amount (calculating new balances for each party using onchain data as described in the [Depositing and Withdrawing](https://github.com/connext/vector/blob/master/modules/contracts/README.md#depositing-and-withdrawing) writeup). Note that this is per-assetId, so a new assetId would be added to the `assetId` array.
2. The `processedDepositsA` and `processedDepositsB` must be updated to reflect that all onchain deposits have been reconciled offchain.
3. The channel nonce must be incremented.
4. A new `ChannelCommitment` must be generated and signed by both parties.
5. Set this update to `state.latestUpdate`.

### Create

A create update is designed to add a new active conditional transfer into the channel state.

The create update must do the following:

1. Decrement the channel state `balance` on one (or both) sides by the amount that will be locked in the transfer (indexed by assetId).
2. Increment channel nonce.
3. Validate the proposed initial `TransferState` by calling the `create` function on the associated transfer definition. This function returns a `boolean` value indicating the validity of the created state
4. Generate a new merkle tree including the hash the `TransferState` and update the `merkleRoot` in the channel state.
5. Generate a duoblesigned `ChannelCommitment`.
6. Set this update to `state.latestUpdate`.

### Resolve

A resolve update should occur when both parties want to remove a conditional transfer from the active transfers, and reintroduce its balances back to the main channel balance.

The resolve update must do the following:

1. Reintroduce the appropriate balance into the channel. This balance is calculated by calling the `resolve` function on the transfer definition (which will also ensure the transfer is able to be resolved).
2. Increment channel nonce.
3. Generate a new merkle tree by removing the hash of the `TransferState` from the active transfers, and update the `merkleRoot` in the channel state.
4. Generate a double signed `ChannelCommitment`
5. Set this update to `state.latestUpdate`
