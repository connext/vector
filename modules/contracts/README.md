# Vector Contracts

The contracts module contains the core solidity files that back Vector's security onchain.

**Do not modify these contracts unless you know exactly what you are doing**.

Contents:

- [Developing and Running Tests](#developing)
- Contracts CLI // TODO
- [Contract Architecture](#contract-architecture)
- [Principles and Assumptions](#principles-and-assumptions)
- [Commitments](#commitments)
- [ChannelFactory and CREATE2](#channelfactory-and-create2)
- [Dispute Flow](#dispute-flow)
- [Depositing and Withdrawing](#depositing-and-withdrawing)
- Security // TODO

## Developing and Running Tests

In `~/vector` (root), run:

- `make contracts` to build just the contracts & it's dependencies
- `make test-contracts` to run the tests
- `make watch-contracts` to test in watch-mode

## Contract Architecture

The contracts are structured as follows:

![alt](https://i.ibb.co/2hB4C3w/vector-Contract-Control-Flow-2.png)

- **ChannelMastercopy** is the primary contract used by Vector channels. It contains logic to handle depositing/withdrawing as well as to adjudicate a channel dispute. To save on the gas cost of repeatedly deploying the contract, we structure this contract as a singleton "Mastercopy" and deploy proxies per-channel.
- **ChannelFactory** is a factory contract that deploys channel proxies to deterministically-generated addresses using the CREATE2 Ethereum opcode.
- **TransferDefinitions** are conditional-transfer-specific logic that are used by both the offchain protocol and the onchain adjudicator to determine the outcome of a given transfer.

## Principles and Assumptions

To simplify the implementation and support the required featureset, the contracts adopt the following principles/assumptions:

1. Channels only have two participants. They are ordered by `[initiator, responder]` and signed into the initial channel state when setting up the channel.
2. Every channel update is accompanied by a **single** corresponding commitment. This commitment is a `CoreChannelState` that is signed by both channel participants.
3. Depositing into a channel is asymmetric -- the intiator of the channel deposits by calling a `depositA` function. The responder simply sends funds to the contract. (This allows for _very_ powerful end-user experiences).
4. Updating the balance of the channel happens by `create`ing and `resolve`ing conditional transfers. Creating a transfer generates a `CoreTransferState` which gets hashed and added to the `merkleRoot` that is a part of the signed `CoreChannelState` for that update. Resolving a transfer removes the hash from the `merkleRoot`.
   - The consequence of this is that a channel can have an arbitrary number of unresolved transfers without changing anything about how the channel is disputed.
5. Transfers can only be resolved by the receiver of that transfer.
6. Transfers are generalized: any arbitrary conditionality can be attached to a `resolve` update. This happens through a `transferDefinition`, a `pure` or `view` contract of the following interface (TODO) which outputs a final balance post-transfer.
7. Transfer are single-turn: they follow a strict `create`->`resolve` flow. However, because they are generalized, it is possible to construct transfers with many intermediary states _so long as those states are independently resolveable_ (i.e. so long as at any point the receiver of the transfer can `resolve` to get a final balance).
8. Withdrawing from the channel happens by constructing a mutually signed commitment to execute an arbitrary transaction from the contract. This can happen trustlessly using `create` and `resolve`.
9. Disputing a channel/transfer happens in two phases: (1) Calling `disputeChannel()` (or `disputeTransfer()`) which finalizes the latest state onchain, (2) Calling `defundChannel()` (or `defundTransfer()`) which withdraws disputed funds.
10. The above calls are made in a `consensus` phase and a `defund` phase, which are started when a dispute begins. After these phases end, the onchain channel contract _resumes a "happy" state_. This means both parties can continue signing commitments at a higher nonce and resume normal channel operations. They also retain the ability to dispute again in case further offchain coordination cannot be reached.

## Commitments

The core purpose of any state channel protocol is to produce one or more commitments that represent a user's ability to get funds onchain in the event that coordination breaks down. This means that commitments are the primary interface between the onchain contracts (which manage rare channel failure cases i.e. disputes) and the offchain protocol (used 99.99% of the time).

In the interest of simplicity, Vector only has one type of commitment that is actually signed - the `ChannelCommitment`, which is a signature on the `CoreChannelState`:

```
struct CoreChannelState {
  Balance[] balances, // index matches assetId index
  address[] assetIds,
  address channelAddress, // Globally unique
  address[2] participants, // [initiator, responder]
  uint256[] processedDepositsA, // index matches assetId index
  uint256[] processedDepositsB, // index matches assetId index
  uint256 timeout,
  uint256 nonce,
  bytes32 merkleRoot
}
```

Despite not being a "real" commitment, the `CoreTransferState` is a part of the merkle root in the channel state. Thus it's security is enforced using both peers' signatures on the above.

```
struct CoreTransferState {
   Balance initialBalance;
   address assetId;
   address channelAddress;
   bytes32 transferId; // Globally unique
   address transferDefinition;
   uint256 transferTimeout; // Note: we have a transfer-specific timeout to enable decrementing timelocks for hopped transfers
   bytes32 initialStateHash;
}
```

## ChannelFactory and CREATE2

Vector uses a proxy pattern and the CREATE2 opcode to optimize onboarding UX for new channels. This means that participants can derive a `channelAddress` deterministically and independently as part of setting up a channel (and, in Bob's case, depositing to it). At some point later (decoupled from onboarding flow), either participant can then call `ChannelFactory.createChannel` to deploy their channel proxy.

To properly protect against replay attacks across chains or discrete networks, the `channelAddress` MUST be globally unique. We additionally include `channelAddress` as part of the channel state, and as a prt of the derivation for `transferId` to properly domain-separate signed calldata as well.

Deriving `channelAddress` uses the following CREATE2 salt:

```
keccak256(
   abi.encodePacked(
      alice, // initiator signer address
      bob, // responder signer address
      chainId,
      keccak256("vector")
   )
);
```

## Dispute Flow

The dispute flow works as follows:

1. A party calls `disputeChannel()` passing in their latest state. This begins the `consensus` phase of the dispute game. The counterparty has the ability to respond with a higher-nonced state within the phase. Note that for now we just wait out the entire phase, but it would be possible to implement a shortcut where if both parties submit updates then the phase can be skipped.
   - Also note that once a dispute has been initiated, the channel should be considered halted. **Neither party should make or accept offchain updates during this time.**
2. After the consensus phase is complete, the latest state of the channel is available onchain. Then, the `defund` phase of the dispute game begins.
3. During the `defund` phase, either party may call `defundChannel()` to withdraw all assets from the channel (for both parties).
4. It is also possible for either party to dispute transfers directly during this phase. The process for this looks somewhat similar to disputing channels. First, parties call `disputeTransfer()` which starts a timeout window within which the transfer state must be finalized. `disputeTransfer()` checks that the hash of the passed in transfer state is a part of the merkle root checkpointed onchain during the channel `consensus` phase.
   - Note that the merkle root is updated to include transfer state during the `create` channel op (where balances are locked into the transfer), and then is updated again to remove the transfer state during the `resolve` channel op (where balances are reintroduced to the core channel state). This means that a disputed transfer can only ever be in it's initial state, which keeps things really simple.
5. Once a transfer is in dispute, anyone can resolve it manually onchain using `defundTransfer` anytime before the transfer dispute window expires. This will call the `TransferDefinition` to get an updated set of balances, and then send those balances to both parties onchain. If no transfer resolver is available, the dispute window will expire and then `defundTransfer` can be called (once again by anyone) to pay out the initial balances of the transfer via `adjudicatorTransfer` on the `VectorChannel` contract.

## Depositing and Withdrawing

As mentioned above, funding a channel is asymmetric. The initiator of a channel (as determined by `participants[]`), _must_ deposit using the `depositA` function in the channel contract. The responder of a channel can deposit simply by sending funds to the channel address.

Calling `depositAlice` increments the `totalDepositsAlice` by the amount that Alice deposits for a given assetId. We can get this value offchain or in the adjudicator by calling the `totalDepositsAlice` getter. We can also get `totalDepositsBob` the same way -- the contract calculates using the following identity:

```
getBalance(assetId) + _totalWithdrawn[assetId] - _totalDepositedAlice[assetId]
```

Note that because this is an identity, we **do not** use SafeMath. _We explicitly want these values to wrap around in the event of an over/undeflow_.

Offchain, we track the `processedDepositsA` and `processedDepositsB`. Thus, we can calculate any pending deposits (that need to be reconciled with the offchain balance) as `totalDepositsAlice.sub(processedDepositsA)`. We do the same onchain in the event of a dispute when calling `defundChannel()`.

The above pattern has a few _highly_ desireable UX consequences:

1. Bob can fund the channel simply by sending funds to the channel address (works out of the box with any on/offramp, exchange, or defi system).
2. Alice and Bob require no upfront coordination to make a deposit. i.e. the offchain process of adding funds to the channel is **entirely** decoupled from actually sending the tx onchain.
3. Alice and Bob can both make many deposits onchain in parallel, reconciling part or all of their pending deposits offchain without introducing any trust assumptions.

Withdrawing works a bit differently:

A withdraw from the channel is done by locking up some funds in a transfer and "burning" them, conditionally upon a withdraw commitment being generated from the channel. Once a commitment is generated, one or both parties _always_ have the ability to put it onchain to get their funds. Because of this, we consider offchain that the withdraw was completed even if it wasn't actually submitted to chain. Note that, in the event of a dispute, both parties MUST submit any pending withdraw commitments to chain to properly receive their remaining funds.

## Contract TODOs

#### Adjudicator

- [x] Make accessible from mastercopy
- [x] Change timeouts in `disputeChannel` to only refresh in the case that the channel is not in the `Consensus` phase. (Basically, each phase `Running`, `Consensus`, `Dispute` should be handled separately)
- [ ] Only allow recipient of a transfer to use `transferResolver` to `resolve` a transfer onchain in `defundTransfer`. Either party should be able to defund it with the existing state, however.
- [ ] Don't need `onlyParticipants` anymore if we're allowing anybody to dispute.
- [ ] `getChannelAddress` needs to be implemented using participants, chainId (from onchain data), hardcoded vector domain separator, and hardcoded `ChannelFactory` address.
- [ ] Fill out signing/hashing utils based on any new needs that might have been introduced as a result of the new control flow for contracts.
- [ ] Events

#### VectorChannel

- [ ] Add events/event listening for deposits
- [x] Write the `adjudicatorTransfer` fn
- [x] Update `getTransactionHash` to use nonce-based replay protection
- [x] Clean up + add missing functions to interface
- [x] Remove update functionality for adjudicator

#### ChannelFactory

- [ ] `createChannelAndDepositA` is very ugly + we need two onchain txs no matter what because of approve/transferFrom

#### Other

- [ ] Do we want to downgrade to 0.6? Possibly not -- TODO/open an issue
- [ ] Change encoding of `Balance` offchain to be fixed size arrays
- [ ] Remove transfer encodings from CoreTransferState offchain
- [ ] Comments / NatSpec

#### Later

- [ ] Solidify asset handling: deal with non-standard-conforming tokens, reverts, reentrancy, etc.
- [ ] Allow to selectively defund assets (?)
