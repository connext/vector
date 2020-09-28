# Vector Contracts

The contracts module contains the core solidity files that back Vector's security onchain.

Contents:
- [Developing and Running Tests](https://github.com/connext/vector/tree/master/modules/contracts#developing)
- [Simplifying Assumptions](https://github.com/connext/vector/tree/master/modules/contracts#simplifying-assumptions)
- [Dispute Flow](https://github.com/connext/vector/tree/master/modules/contracts#dispute-flow)
- [Funding a Channel](https://github.com/connext/vector/tree/master/modules/contracts#funding-a-channel)
- [Commitments](https://github.com/connext/vector/tree/master/modules/contracts#commitments)
- Security // TODO

## Developing and Running Tests

In `~/vector` (root), run:
- `make contracts` to build just the contracts & it's dependencies
- `make test-contracts` to run the tests
- `make watch-contracts` to test in watch-mode

## Simplifying Assumptions

The Vector contracts make some simplifying assumptions compared to CounterFactual:

- All "apps" (now just called transfers) are single-turn only. We also explicitly assume that the app state contains a `balances[]` tuple.
- Rather than keeping track of an `activeApps[]`, we now just include a merkle root within the `ChannelState`. This means that a `TransferState` must include corresponding materials for a proof (gets validated as part of `disputeTransfer()`)
- No more pushing outcomes -- the responsibility for deciding on a final set of balances to be transferred is delegated entirely to the `transferDefinition` code.
- Disputing occurs within a dispute window within which `defundChannel()` and any `defundTransfer()` calls MUST be made. After the window ends, the channel returns to a "happy" state onchain (including any undisputed transfers). After that point, a _new_ dispute can happen at or above the nonce registered onchain.
- After the dispute window ends, both parties can continue signing commitments at a higher nonce and resume normal channel operations. They also retain the ability to dispute again in case offchain coordination cannot be reached.

## Dispute Flow

The dispute flow works as follows:

1. A party calls `disputeChannel()` passing in their latest state. This begins the `consensus` phase of the dispute game. The counterparty has the ability to respond with a higher-nonced state within the phase. Note that for now we just wait out the entire phase, but it would be possible to implement a shortcut where if both parties submit updates then the phase can be skipped.
   - Also note that once a dispute has been initiated, the channel should be considered halted. **Neither party should make or accept offchain updates during this time.**
2. After the consensus phase is complete, the latest state of the channel is available onchain. Then, the `defund` phase of the dispute game begins.
3. During the `defund` phase, either party may call `defundChannel()` with an array of `assetId`s to remove those assets from the channel (for both parties).
4. It is also possible for either party to dispute transfers directly during this phase. The process for this looks somewhat similar to disputing channels. First, parties call `disputeTransfer()` which starts a timeout window within which the transfer state must be finalized. `disputeTransfer()` checks that the hash of the passed in transfer state is a part of the merkle root checkpointed onchain during the channel `consensus` phase.
   - Note that the merkle root is updated to include transfer state during the `create` channel op (where balances are locked into the transfer), and then is updated again to remove the transfer state during the `resolve` channel op (where balances are reintroduced to the core channel state). This means that a disputed transfer can only ever be in it's initial state, which keeps things really simple.
5. Once a transfer is in dispute, anyone can resolve it manually onchain using `defundTransfer` anytime before the transfer dispute window expires. This will call the `TransferDefinition` to get an updated set of balances, and then send those balances to both parties onchain. If no transfer resolver is available, the dispute window will expire and then `defundTransfer` can be called (once again by anyone) to pay out the initial balances of the transfer via `adjudicatorTransfer` on the `VectorChannel` contract.

## Funding a Channel

In Vector, channel funding is asymmetric.

The initiator of a channel (as determined by `participants[]`), _must_ deposit using the `depositA` function in the channel contract. The responder of a channel can deposit simply by sending funds to the channel address.

Calling `depositA` registers Alice's deposit `amount`, `assetId`, `depositNonce` as the latest deposit onchain. This means that Alice's flow for depositing funds is:

1. Call `depositA` with funds (if this is the first deposit, Alice can do this while also deploying the proxy)
2. Attempt to reconcile the latest deposit in Alice's balance offchain with Bob (i.e. add `deposit.amount` to `balanceA`)
3. If Bob does not reconcile the balance, at any time before her next deposit, Alice can `disputeChannel()`, finalize her latest state onchain, and then call `defundChannel()`.

For Alice, `defundChannel()` works by checking the latest state passed in (which is itself validated against the latest state hash registered onchain in `disputeChannel()`). If the `state.depositNonce` is equal to deposit nonce from the channel data, that means that the latest deposit was reconciled against the balance. If the `state.depositNonce` is one behind the deposit nonce onchain, then that means that the latest deposit was _not_ reconciled against the balances. -- Note that all other cases should _never_ happen.

In the former case, Alice's balance is equal to her `state.balanceA`. In the latter, her balance is equal to `state.balanceA + channel.deposit.amount`.

For Bob, depositing works somewhat similarly:

1. Send funds to channel directly
2. Attempt to reconcile the latest deposit in Bob's balance offchain with Alice (i.e. add `deposit.amount` to `balanceB`)
3. If Alice does not reconcile the balance, Bob can `disputeChannel()` and then `defundChannel()` as above.

For Bob, `defundChannel()` will pay out based on the following logic: We calculate Alice's balance as above (including the possibly unmerged latest deposit). Then, Bob's balance is `channelOnchainBalance - (balanceA(including potential deposit) + lockedBalance)` where `lockedBalance` is the total amount of funds in the channel currently allocated to any transfers. Another way to say the above is that the protocol will assume that any excess funds that are not explicitly a part of Alice's state OR Alice's unmerged deposits OR locked transfer value must belong to Bob.

The above flows have a few consequences:

- Bob can send funds to the channel at any time with any frequency and eventually reconcile them with his balances
- Alice does not need to do preparatory work before sending her deposit to chain. The onchain part of her deposit is entirely decoupled from offchain reconciliation.
- We need to pass in an `assetId[]` array into `defundChannel()` in order for it to work. The benefit here is that you dont actually need to dispute the entire balance in a single tx, which means that we shouldn't ever get into a case where the channel state is too large to dispute (even if there are 1000s of tokens).
- Alice's cannot deposit many times concurrently

## Commitments
One of the biggest headaches in CF is that we use multiple different types of commitments for channel disputes vs app disputes. This creates an attack vector where, in a single roundtrip, one party can choose to sign some of the commitments but not others (this is why we have `propose` and `install` as two separate protocols in CF).

In vector, we have only one type of commitment for disputing - the `ChannelCommitment`, which is a signature on the `CoreChannelState`:

```
struct CoreChannelState {
   Balance[][] balances; // TODO index by assetId? // initiator, responder
   uint256[] lockedBalance; // Indexed by assetId -- should always be changed in lockstep with transfers
   address[] assetIds;
   bytes32 channelAddress;
   address[] participants; // Signer keys -- does NOT have to be the same as balances.to[]
   uint256 timeout;
   uint256 nonce;
   bytes32 merkleRoot;
}
```

Despite not being a "real" commitment, the `CoreTransferState` is a part of the merkle root in the channel state. Thus it's security is enforced using both peers' signatures on the above.

```
   struct CoreTransferState {
      Balance balance;
      address assetId;
      address channelAddress;
      bytes32 transferId;
      address transferDefinition;
      uint256 transferTimeout;
      bytes32 initialStateHash;
      bytes[] encodings; // Initial state, resolver state
      bytes32[] merkleProofData;
   }
```

## Contract TODOs

#### Adjudicator
- [X] Make accessible from mastercopy
- [X] Change timeouts in `disputeChannel` to only refresh in the case that the channel is not in the `Consensus` phase. (Basically, each phase `Running`, `Consensus`, `Dispute` should be handled separately)
- [ ] Only allow recipient of a transfer to use `transferResolver` to `resolve` a transfer onchain in `defundTransfer`. Either party should be able to defund it with the existing state, however.
- [ ] Don't need `onlyParticipants` anymore if we're allowing anybody to dispute.
- [ ] `getChannelAddress` needs to be implemented using participants, chainId (from onchain data), hardcoded vector domain separator, and hardcoded `ChannelFactory` address.
- [ ] Fill out signing/hashing utils based on any new needs that might have been introduced as a result of the new control flow for contracts.
- [ ] Events

#### VectorChannel
- [ ] Add events/event listening for deposits
- [X] Write the `adjudicatorTransfer` fn
- [X] Update `getTransactionHash` to use nonce-based replay protection
- [X] Clean up + add missing functions to interface
- [X] Remove update functionality for adjudicator

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
