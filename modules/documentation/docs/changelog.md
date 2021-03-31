# Vector Changelog

## Next Release

## 0.2.1-beta.22

- \[router\] Fix autorebalancing

## 0.2.1-beta.21

- \[router\] Potential double collateral edge case

## 0.2.1-beta.20

- \[node\] Router config for cluster

## 0.2.1-beta.19

- \[node\] Use upgraded messaging cluster

## 0.2.1-beta.15

- \[utils\] Add bsc testnet to chains.json

## 0.2.1-beta.14

- \[engine\] Add handling in case withdrawals are not immediately reconciled

## 0.2.1-beta.13

- \[contracts\] Request collateral also adjusts

## 0.2.1-beta.12

- \[contracts\] Wait at least 1 conf for all chains

## 0.2.1-beta.11

- \[utils\] Coin gecko utility function exiting early if ETH used
- \[router\] Metrics not being able to convert matic
- \[contracts\] Handle weird error with transaction receipt fetching

## 0.2.1-beta.10

- \[engine\] Change withdrawal fee calculations

## 0.2.1-beta.9

- \[router\] Change fee calculations

## 0.2.1-beta.8

- \[contracts\] Add retry logic to `ethReader`
- \[engine\] Bug in fee calculation fix

## 0.2.1-beta.7

- \[all\] Add confirmations for most chains
- \[router\] Use `estimateGas` instead of hardcoded estimates

## 0.2.1-beta.6

- \[all\] Add confirmations for most chains
- \[router\] Improvements to fee stats

## 0.2.1-beta.5

- \[types\] Update estimated gas fees

## 0.2.1-beta.4

- \[contracts\] Result-ify waiting for transactions

## 0.2.1-beta.3

- \[router\] Create queues for transfer creation races
- \[engine, types\] Make timeout parameter optional for setup, conditional transfer, and withdraw

## 0.2.1-beta.2

- \[engine\] Remove time validation on engine

## 0.2.1-beta.1

- \[server-node, router\] Increase max `request.body` size on fastify servers

## 0.2.1-beta.0

- \[engine\] Fix error handler bug

## 0.2.0

- \[router\] Rebalance from Matic -> ETH Mainnet
- \[node\] Add `from` to send transactions
- \[contracts\] Deploy to lots of chains!

## 0.2.0-beta.9

- \[engine\] Add `transaction` to `WITHDRAWAL_RESOLVED` event
- \[node\] Make `transaction` a non-optional return value

## 0.2.0-beta.8

- \[engine, router\] Allow users to specify if they want to receive an exact amount when requesting a quote

## 0.2.0-beta.7

- [engine] Fix transfer event balances
- [engine] Allow Bob to specify submitting their own withdrawals

## 0.2.0-beta.6

- \[engine\] Only error if fees > amount, not fees >= amount
- \[types, router, engine\] Use `DEFAULT_FEE_EXPIRY` from types package

## 0.2.0-beta.5

- \[router, node\] Bump up default fee expiry, make configurable

## 0.2.0-beta.4

- \[config\] - Remove config overrides with defaults

## 0.2.0-beta.3

- \[router\] Fix fees bugs
- \[node\] Remove fees from default config
- \[router,engine\] Fast exit if no fees configured
- \[utils\] Check for lower-cased token addresses from coingecko

## 0.2.0-beta.2

- \[router\] Fix fees bugs
- \[engine\] Add fees tests
- \[test-runner\] Fix tests to work with fees

## 0.2.0-beta.1

- \[router\] Fix fees bug

## 0.2.0-beta.0

- \[router\] Add fee collection config
- \[engine\] Add fees automatically on transfer and withdrawals
- \[engine\] Add fees for withdrawal

## 0.1.18-beta.1

- \[router\] Clean up hanging transfers on reconnect

## 0.1.18-beta.0

- \[browser-node\] Beta feature: Sign in with login providers: Metamask + Magic.Link

## 0.1.17

- \[router\] Fix collateral bug
- \[contracts\] Check if contract is deployed before calling `chainService.getWithdrawalStatus`

## 0.1.16

- \[contracts\] Fix `chainReader` balance bug
- \[contracts\] Fix `chainService` deposit bug
- \[router\] Update volume metric collections

## 0.1.15

- \[contracts\] Add BSC deployment data
- \[router\] Dashboard update

## 0.1.15-beta.21

- \[router\] Fix auto-rebalancing bug

## 0.1.15-beta.20

- \[router\] Don't create 0 valued withdrawals
- \[server-node\] Ignore no-op withdrawals

## 0.1.15-beta.19

- \[server-node\] Query chain instead of using error message

## 0.1.15-beta.18

- \[server-node\] Remove unique condition for `onchainTransactionId`

## 0.1.15-beta.17

- \[server-node\] Filter transfers by definition when getting unsubmitted withdrawals
- \[server-node\] Improve logging for admin endpoint

## 0.1.15-beta.16

- \[server-node\] Hold withdrawals as alice on mainnet
- \[server-node\] Add admin endpoint to resubmit all withdrawals
- \[server-node\] Submit withdrawals when gas price is low or commitments are > 1 week old

## 0.1.15-beta.15

- \[router\] Fix bug in auto-rebalance

## 0.1.15-beta.14

- \[router\] Add auto-rebalance service for Matic deposit

## 0.1.15-beta.13

- \[ops\] Add persistent storage for Grafana
- \[contracts\] Add `transactionHash` to withdrawal commitment
- \[store\] Add `transferDefinition` to filter options on `getTransfers`
- \[store\] Add `getWithdrawalCommitmentByTransactionHash` method
- \[types\] Add `createdAt`/`resolvedAt` to `FullTransferState.meta` + make transfer meta types generic

## 0.1.15-beta.12

- \[contracts\] Deploy contracts to BSC testnet

## 0.1.15-beta.11

- \[iframe\] Allow `chainAddresses` and `messagingUrl` to be passed into iframe's node creation

## 0.1.15-beta.10

- \[router\] Improve router dashboards
- \[contracts\] Add xdai deployment

## 0.1.15-beta.9

- \[router\] Add router dashboards

## 0.1.15-beta.8

- \[types\] Remove unique constraint from `TransferEncodingSchema`

## 0.1.15-beta.7

- \[ops\] Fix github actions.

## 0.1.15-beta.6

- \[node, router\] Prisma upgrade.

## 0.1.15-beta.5

- \[contracts\] Fix token approval bug

## 0.1.15-beta.4

- \[iframe\] Improve error parsing

## 0.1.15-beta.3

- \[node\] Expose `getTransfers` method.

## 0.1.15-beta.2

- \[utils\] Create util for determining which participant
- \[all\] Don't use pino-pretty in prod mode

## 0.1.15-beta.1

- \[router\] Do not forward if deposit balance is not present in channel
- \[router\] Fix start script to pass mnemonic secret into router

## 0.1.15-beta.0

- \[utils\] Don't use `instanceof` operator

## 0.1.14

- \[server-node\] Fix withdrawal commitment store bugs
- \[server-node\] Fix error handling (always use `jsonifyError`)

## 0.1.13

- \[router\] Hotfix for gas price query errors
- \[router\] Admin endpoint to retry withdrawal txs

## 0.1.13-beta.0

- \[all\] Update packages that were flagged by `npm audit`

## 0.1.12

- \[all\] Update packages that were flagged by `npm audit`

## 0.1.11

- \[all\] Update packages that were flagged by `npm audit`

## 0.1.10

- \[utils\] Pass in `chainId` when creating providers

## 0.1.9

- \[engine\] Fix deposit reconciliation race condition evaluation
- \[contracts\] Use `gasNow` to get mainnet gas price over ethers

## 0.1.8

- \[node\] Add `getTransfers` endpoint with filtering capabilities.
- \[router\] Add router dashboard with signer address balance monitoring.

## 0.1.8-beta.6

- \[protocol\] Fix non-checksummed addresses

## 0.1.8-beta.5

- \[iframe\] Allows connect on iframe to be called multiple times (i.e. with different chainProviders)
- \[engine\] Only updates disputes/sends isAlive messages if chain is supported
- \[browser-node\] Changes store prefix to be signer-specific, doesn't delete stores on start if signer key !== locally stored key
- \[browser-node\] Removes crossChainTransfer from browser-node

## 0.1.8-beta.4

- \[contracts\] Add `drip` task to hardhat
- \[engine\] Ensure created withdrawals are resolved on startup

## 0.1.8-beta.3

- \[messaging\] Fix for loop in message retry code

## 0.1.8-beta.2

- \[messaging\] Fix for loop in message retry code

## 0.1.8-beta.1

- \[protocol\] Remove retrying on protocol messages
- \[protocol\] Hard error for lock release

(Kids -- don't debug on prod)

## 0.1.8-beta.0

- \[protocol\] Retry sending messages
- \[protocol\] Do not throw error if lock is not released
- \[messaging\] Add retry logic

## 0.1.7

- \[router\] Update status of processed stored updates

## 0.1.6

- \[browser-node\] Save crossChainTransfer error state

## 0.1.5

- \[browser-node\] Fix bug in `crossChainTransferStore` key

## 0.1.4

- \[contracts\] Fix bug in `chainService`

## 0.1.3

- \[browser-node\] Remove from storage if transfer is cancelled.
- \[browser-node\] Register listener for sender cancellations once
- \[browser-node\] Don't hang on `crossChainTransfer` if sender-side transfer cancelled
- \[router\] Handle unverified (sent a single-signed) updates for transfer forwarding on check-in (using `reconcileDeposit` for state consensus)
- \[contracts\] Improvements with `gasPrice` and `gasLimit` in chain servce

## 0.1.3-beta.1

- \[browser-node\] Remove from storage if transfer is cancelled.

## 0.1.2

- \[router\] Add NATS client
- \[browser-node, server-node\] Add methods to get router config
- \[browser-node\] Verify swap supported before `crossChainTransfer`
- \[router\] Hotfix `toString()` undefined
- \[ops\] Add LogDNA tag support to router config

## 0.1.1

- \[all\] Improve logging
- \[contracts\] Add etherscan verification plugin
- \[router\] Correctly reclaim from the sender's channel
- \[contracts\] Check if channel is deployed right before deploying
- \[router\] Checksum config assetIds
- \[engine\] Checksum user input assetIds

## 0.1.0

- \[all\] Mainnet release :tada:
- \[all\] Improve handling of non-vector errors

## 0.1.0-rc.25

- \[all\] Improve error handling

## 0.1.0-rc.24

- \[utils\] Update `eccrypto-js` to fix sig recovery bug

## 0.1.0-rc.23

- \[types\] Restore signature length to 130
- \[protocol\] Add signature logging

## 0.1.0-rc.22

- \[types\] Update signature regex

## 0.1.0-rc.21

- \[browser-node\] Require `chainProviders` to be passed into iframe

## 0.1.0-rc.20

- \[engine\] Retry on deposit race condition for inbound errors

## 0.1.0-rc.19

- \[router\] Remove obtrusive metrics
- \[messaging\] Properly catch messaging timeouts
- \[ops\] Fix router logdna

## 0.1.0-rc.18

- \[all\] Fix bad publishing

## 0.1.0-rc.17

- \[router\] Allow payments that exceed `reclaimThreshold` to be collateralized just in time
- \[router\] Allow `profile.target` to be 0 (always use just in time collateralization)
- \[messaging\] Improve error context

## 0.1.0-rc.16

- \[engine\] Retry on deposit race condition
- \[router\] Cleanup collateral transaction logic + more tests
- \[browser-node\] make crosschain transfers idempotent

## 0.1.0-rc.9

- \[router/server-node\] optionally skip checkin on start

## 0.1.0-rc.8

- \[messaging\] add `undefined` check on error handling

## 0.1.0-rc.7

- \[types\] relax `transferResolver` schema to allow for ethers decoded values

## 0.1.0-rc.6

- \[router\] fix prisma webpack

## 0.1.0-rc.4

- \[router\] add logdna service

## 0.1.0-rc.3

- \[contracts\] add deployment info for mainnet and matic mainnet

## 0.1.0-rc.1

- \[router\] add isAlive check before forwarding transfer to increase odds of successful transfer

## 0.1.0-rc.0

- \[contracts\] audit results implemented
- \[router\] store and process queued updates
- \[engine\] restore state from counterparty
- \[engine\] handle `isAlive` messages
- \[router\] fix rebalance profile getter to respect assetIds
- \[router\] cancel transfers if they are unsuccessful
- \[contracts\] added required `EncodedCancel` getter to transfer registry interface
- \[engine\] add rpc schema + param conversion tests

## 0.0.38

- propagate meta through updates

## 0.0.37

- refactor messaging service

## 0.0.36

- use correct withdrawal amount

## 0.0.35

- remove browser node `waitFor` calls

## 0.0.33

- add sign method to browser node

## 0.0.32

- add utility sign method

## 0.0.31

- fix browser node store issue
- fix `TFullTransferState` schema
- store `getChannelStateByParticipants` accepts identifiers instead of addresses
- make sure all rpc queries properly return `Result` types in error cases
- add `crossChainTransfer` to iframe

## 0.0.28

- use receiver payment name instead of transfer definition
- add protocol-level validation
- add `create` protocol integration tests

## 0.0.26

- fix cross-chain transfer bug

## 0.0.23

- add `sync` unit tests
- clean `sync` code
- remove syncing attempts on protocol startup
- add message schema validation to inbound protocol updates
- bring images and packages back in sync

## 0.0.21

- fix `iframe-app` docker image to not override env vars on start

## 0.0.20

- fix allowance bug in `chainReader` for token deposits

## 0.0.19

- republish due to browser-node error in 0.0.18

## 0.0.18

- public identifiers prefixed with `vector` instead of `indra`

## 0.0.17

- update dispute contract events to be more verbose
- add `AliceDeposited` events
- add `TransferRegistered` and `TransferRemoved` events
- rename `emergencyWithdraw` to `exit`
- update contract documentation (ready for audit)

## 0.0.16

- fix dockerfile in iframe-app

## 0.0.15

- fix db package issue which was causing migrations to break

## 0.0.14

- use individual ethers packages instead of ethers
- various smaller contract changes
- simplified inheritance hierarchy for channel mastercopy
- cheaper `onlyViaProxy` modifier
- saturated addition for emergency-withdrawable amounts
- dockerized iframe-app published with docker images
- add endpoint for getting ethprovider sync status

## 0.0.13

- chainId pulled from opcode if not provided on creation
- improve testing
- deploy contracts to Kovan
- refactor protocol to improve readability
- pass in array of assetIds to `defundChannel` (defund by assetId)
- add `getRegisteredTransfers` rpc + node methods
- move to withdrawal pattern
- move from block numbers to timestamps
- browser-node-sdk: generate entropy fully at iframe
- refactor channel factory

## 0.0.12

- Browser node iframe functionality

## 0.0.11

- introduce and use commitment types
- reconcile hashing
- remove commitment type

## @connext/{types,utils,contracts,protocol,engine,browser-node}@0.0.9, @connext/{server-node}@0.0.10

- implement generalized withdrawals
- fix and minor improvements around asset transfers
- move dispute methods into engine
- shorter revert message style and contract tests speedup
- minor cleanup and reorganization related to types and interfaces
- make transfer types generic

## @connext/{types,utils,contracts,protocol,engine,browser-node}@0.0.9, @connext/{server-node}@0.0.9

- add deploy channel tx function to eth service
- add autodeployment after setup for some chains (currently only arbitrum)
- add arbitrum to address book

## @connext/{types,utils,contracts,protocol,engine,browser-node}@0.0.6-beta.1, @connext/{server-node}@0.0.8

- fix `defundNonce` in server node store
- expose nats 4221 by default
- support trio and contract testing across remote chains
- improve asset handling
- minor changes in transfer definitions and transfer registry

## @connext/{types,utils,contracts,protocol,engine,browser-node}@0.0.4

- Fix webpack configs for browser node.

## @connext/{types,utils,contracts,protocol,engine,browser-node}@0.0.3-beta.5

- add revert messages to `LibIterableMapping`.
- fix browser-node store `getChannelStateByParticipants` method.

## @connext/{types,utils,contracts,protocol,engine,browser-node}@0.0.3-beta.0

- fix bug in onchain computation of channel address.
- simplify Proxy contract.
- `@connext/vector-utils` dependency fixes.
- migrate buidler to hardhat.
