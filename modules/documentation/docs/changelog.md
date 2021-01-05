# Vector Changelog

## Next Release

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
