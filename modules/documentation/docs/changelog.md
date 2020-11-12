# Vector Changelog

## Next Release

- implement generalized withdrawals
- fix and minor improvements around asset transfers
- shorter revert message style and contract tests speedup
- minor cleanup and reorganization related to types and interfaces

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
