# Vector Changelog

## Next Release

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
