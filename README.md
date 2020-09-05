# Vector
Vector is an ultra-minimal state channel implementation that borrows ideas from the Counterfactual framework, the v1 Connext Payment Channel Hub, and the StateChannels framework.

## Core Principles
Vector uses the following fundamental design principles:
- All channels have two parties
- Channel participants[] are ordered by `initiator, responder`
- The protocol *only* allows for single-turn conditional transfers. The logic for resolving the transfer can have arbitrary complexity so long as it conforms to a base standard around how `balances` are defined. Because the logic can be complex (though only have single "turn" played by the receiver), it is possible to theoretically construct many-turn State Channel applications so long as each state is independently finalizeable. The communication for these "meta"-updates MUST happen entirely out-of-band and be validated by the implementer independently of the protocol.
- Vector uses leader-election/consensus for concurrency control (like CF), rather than using CRDTs like StateChannels

The core protocol flow has three primary phases:
1. **Leader Election** -- this is done using a distributed lock implementation. Peers queue updates on the lock and execute them serially.
2. **Update Generation** -- a proposed update is generated by the sender in-memory
3. **Syncronization** -- the sender's update is dispatched over the wire. Receiver validates the update, merges the update with their channel, stores the channel, and then acks. Sender receives the ack and stores.

## Sync Protocol
At the core of Vector lies the `sync` protocol. Unlike in CounterFactual, there is only a single protocol -- `sync` is used both when a sender wants to propose a new update to the replicated state, and *also* when peer state has diverged. Because updates are monotonic (nonce += 1), there are only a very limited number of cases within which party states possibly diverge.

For this reason, `sync` takes a higher degree of control over message delivery than CF does. Outbound messages are retried on a timer if they fail. Inbound message nonces are checked against the `ChannelState` in store and dropped if they are duplicates.

