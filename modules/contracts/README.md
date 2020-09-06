# Vector Contracts
## Overview
The Vector contracts make some simplifying assumptions compared to CF:
- All "apps" (now just called transfers) are single-turn only. We also explicitly assume that the app state contains a `transfers[]` tuple.
- Rather than keeping track of an `activeApps[]`, we now just include a merkle root within the `ChannelState`. This means that a `TransferState` must include corresponding materials for a proof (gets validated as part of `emptyTransfer()`)
- No more pushing outcomes -- the responsibility for deciding on a final set of balances to be transferred is delegated entirely to the `transferDefinition` code.
- Disputing occurs within a dispute window within which `emptyChannel()` and any `emptyTransfer()` calls MUST be made. After the window ends, the channel returns to a "happy" state onchain (including any undisputed transfers). After that point, any *new* disputes/checkpointing MUST happen at a higher nonce than what is already registered onchain.
- After the dispute window ends, both parties can continue signing commitments at a higher nonce and resume normal channel operations.

Additionally, the contract control flow in Vector is inverted compared to CF (it is more similar to StateChannels):

![alt text](<https://i.ibb.co/gyqFSzg/vector-Contract-Control-Flow.png)

## Disputes
The dispute flow works as follows:
1. A party calls `forceChannelConsensus()` passing in their latest state. This begins the `consensus` phase of the dispute game. The counterparty has the ability to respond with a higher-nonced state within the phase. Note that for now we just wait out the entire phase, but it would be possible to implement a shortcut where if both parties submit updates then the phase can be skipped.
   - Also note that once a dispute has been initiated, the channel should be considered halted. **Neither party should make or accept offchain updates during this time.**
2. After the dispute phase is complete, the latest state of the channel is available onchain. Then, the `exit` phase of the dispute game begins.
3. During the `exit` phase, either party may call `emptyChannel()` with an array of `assetId`s to remove those assets from the channel (for both parties).
4. It is also possible for either party to dispute transfers directly during this phase. Parties may either call `emptyTransfer()` directly OR may first call `setTransferResolution()`. The latter should be called first when the transfer has been created but not yet resolved offchain and the caller has the means to resolve it. In this case, the caller passes in the initial state of the transfer, along with a resolving update -- if these params pass validation, we call `resolveTransfer()` in the contract at `TransferDefinition` and then save the resulting balances to state. When `emptyTransfer()` is called, it takes in latest state -- if the transfer is resolved, it immediately calls the `Multisig.sol` using `assetId` and finalized `transfers[]`. Else, it looks onchain for a `transferResolution` for that `transferId` and uses that resolution to send balanced. If neither work, then it reverts.

## Funding a Channel
//TODO check security

In Vector, channel funding is asymmetric.

The initiator of a channel (as determined by `participants[]`), *must* deposit using the `depositA` function in the `Multisig.sol` contract. The responder of a channel can deposit simply by sending funds to the multisig address.

Calling `depositA` registers Alice's deposit `amount`, `assetId`, `depositNonce` as the latest deposit onchain. This means that Alice's flow for depositing funds is:
1. Call `depositA` with funds
2. Attempt to reconcile the latest deposit in Alice's balance offchain with Bob (i.e. add `deposit.amount` to `balanceA`)
3. If Bob does not reconcile the balance, at any time before her next deposit, Alice can `forceChannelConsensus()`, finalize her latest state onchain, and then call `emptyChannel()`.

For Alice, `emptyChannel()` works by checking the latest state passed in (which is itself validated against the latest state hash registered onchain in `forceChannelConsensus()`). If the `state.depositNonce` is equal to deposit nonce from the multisig data, that means that the latest deposit was reconciled against the balance. If the `state.depositNonce` is one behind the deposit nonce onchain, then that means that the the latest deposit was *not* reconciled against the balances. -- Note that all other cases should *never* happen.

In the former case, Alice's balance is equal to her `state.balanceA`. In the latter, her balance is equal to `state.balanceA + multisigData.deposit.amount`.

For Bob, depositing works somewhat similarly:
1. Send funds to multisig directly
2. Attempt to reconcile the latest deposit in Bob's balance offchain with Alice (i.e. add `deposit.amount` to `balanceB`)
3. If Alice does not reconcile the balance, Bob can `forceChannelConsensus()` and then `emptyChannel()` as above.

For Bob, `emptyChannel()` will pay out based on the following logic: We calculate Alice's balance as above (including the possibly unmerged latest deposit). Then, Bob's balance is `multisigOnchainBalance - (balanceA(including potential deposit) + lockedBalance)` where `lockedBalance` is the total amount of funds in the channel currently allocated to any transfers. Another way to say the above is that the protocol will assume that any excess funds that are not explicitly a part of Alice's state OR Alice's unmerged deposits OR locked transfer value must belong to Bob.

The above flows have a few consequences:
- Bob can send funds to the multisig at any time with any frequency and eventually reconcile them with his balances
- Alice does not need to do preparatory work before sending her deposit to chain. The onchain part of her deposit is entirely decoupled from offchain reconciliation.
- We need to pass in an `assetId[]` array into `emptyChannel()` in order for it to work. This is probably ok as the function should be able to be called multiple times within the dispute window. //TODO is this true?
- Alice's cannot deposit many times concurrently (we can potentially modify the `latestDepositByAssetId` to track historic balances and aggregate them to allow this, however)