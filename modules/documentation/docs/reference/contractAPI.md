# Contract API Reference

There are three main public contracts:

- [`ChannelFactory`](#channel-factory): deploys and sets up the channel multisigs
- [`ChannelMastercopy`](#channel-mastercopy): contains all logic for channel multisigs
- [`TransferRegistry`](#transfer-registry): contains all supported transfer definitions

## Entities

### Balance

`Balance`: `struct` - contains:

- `amount`: `uint256[2]` - Balance owed to `[alice, bob]` in channel, or `[initiator, responder]` in transfers. Represents value to be transferred in the case of a defund event.
- `to`: `address payable[2]` - Addresses of `[alice, bob]` in channel balances, or `[initiator, responder]` in transfers. Represents where the funds will be sent in the case of a defund event.

### CoreChannelState

`CoreChannelState`: `struct` - contains:

- `channelAddress`: `address` - Deployed address of the channel multisig
- `alice`: `address` - The non-priveleged actor of the channel (must call `depositAlice` function when sending funds to the multisig). Intermediaries will always be `alice` in their channels with users.
- `bob`: `address` - The priveleged actor of the channel (can send funds directly to the `channelAddress` when depositing). End-users will always be `bob` in their channels with intermediaries.
- `assetIds`: `address[]` - Address of all assets that have ever been deposited into the channel
- `balances`: `Balance[]` - Balances of participants, ordered by `assetId` (i.e. `balances[i]` represents the balance of each participant for the `assetId` stored at `assetId[i]`)
- `processedDepositsA`: `uint256[]` - Deposits that have been incorporated into the offchain state for `alice`, ordered by `assetId` (allows unreconciled assets to be properly disbursed during adjudication)
- `processedDepositsB`: `uint256[]` - Deposits that have been incorporated into the offchain state for `bob`, ordered by `assetId` (allows unreconciled assets to be properly disbursed during adjudication)
- `defundNonces`: `uint256[]` - The latest nonce the channel was defunded at, ordered by `assetId` (prevents double-defunding of assets during adjudication)
- `timeout`: `uint256` - The time used to set dispute windows, in seconds.
- `nonce`: `uint256` - The channel nonce
- `merkleRoot`: `bytes32` - The root of the merkle tree constructed from the hash of all active initial transfer states

### CoreTransferState

`CoreTransferState`: `struct` - contains:

- `channelAddress`: `address` - Deployed address of the channel multisig associated with the transfer
- `transferId`: `bytes32` - Unique transfer identifier, constructed by the participants and channel nonce
- `transferDefinition`: `address` - The deployed address of the transfer logic
- `initiator`: `address` - The transfer initiator address
- `responder`: `address` - The transfer responder address
- `assetId`: `address` - The deployed address of the transfer asset
- `balance`: `Balance` - The balance of the transfer
- `transferTimeout`: `uint256` - The timeout for the transfer to be resolved
- `initialStateHash`: `bytes32` - Hash of the transfer initial state (as defined by the transfer definition)

### ChannelDispute

`ChannelDispute`: `struct` - contains:

- `channelStateHash`: `bytes32` - The hash of the channel state being disputed
- `nonce`: `uint256` - The nonce of the state being disputed
- `merkleRoot`: `bytes32` - The root of the merkle tree constructed from the hash of all initial transfer states active at the disputed channel state nonce
- `consensusExpiry`: `uint256` - The `block.timestamp` representing when it is no longer acceptable to progress the nonce of the channel dispute. Calculated as `block.timestamp.add(channelState.timeout)` at the time of channel dispute
- `defundExpiry`: `uint256` - The `block.timestamp` representing when it is no longer acceptable to attempt to defund any additional transfers or assets. Calculated as `block.timestamp.add(channelState.timeout.mul(2))` at the time of channel dispute

### TransferDispute

`TransferDispute`: `struct` - contains:

- `transferStateHash`: `bytes32` - The hash of the disputed transfer state
- `transferDisputeExpiry`: `uint256` - The `block.timestamp` representing when the transfer can no longer be defunded. Calculated as `block.timestamp.add(transferState.transferTimeout)`
- `isDefunded`: `bool` - Flag indicating whether a disputed transfer has been defunded

### RegisteredTransfer

`RegisteredTransfer`: `struct` - contains:

- `name`: `string` - The name of the transfer (i.e. `HashlockTransfer`)
- `definition`: `address` - The deployed address of the contract hosting the transfer logic
- `stateEncoding`: `string` - The abi encoder v2 compatible encoding of the transfer state used in the transfer definition
- `resolverEncoding`: `string` - The abi encoder v2 compatible encoding of the transfer resolver used in the transfer definition

## Events

### ChannelCreation

Emitted by the `ChannelFactory` when a new channel proxy is deployed, contains:

- `channel`: `address` - The address of the newly deployed channel

### ChannelDisputed

Emitted by the `ChannelMastercopy` when `disputeChannel` has been called, contains:

- `disputer`: `address` - The address of the `disputeChannel` caller
- `channelAddress`: `address` - The address of the channel being disputed
- `dispute`: `ChannelDispute` - The resulting channel dispute record

### ChannelDefunded

Emitted by the `ChannelMastercopy` when `defundChannel` has been called, contains:

- `defunder`: `address` - The address of the `defundChannel` caller
- `channelAddress`: `address` - The address of the channel being defunded
- `dispute`: `ChannelDispute` - The resulting channel dispute record
- `assetIds`: `address[]` - The assets that were defunded
- `indices`: `indices` - The indices used when defunding assets

### TransferDisputed

Emitted by the `ChannelMastercopy` when `disputeTransfer` has been called, contains:

- `disputer`: `address` - The address of the `disputeTransfer` caller
- `channelAddress`: `address` - The address of the channel associated with the disputed transfer
- `transferId`: `bytes32` - The identifier of the transfer being disputed
- `dispute`: `TransferDispute` - The resulting transfer dispute record

### TransferDefunded

Emitted by the `ChannelMastercopy` when `defundTransfer` has been called, contains:

- `defunder`: `address` - The address of the `defundTransfer` caller
- `channelAddress`: `address` - The address of the channel associated with the defunded transfer
- `transferId`: `bytes32` - The identifier of the transfer being disputed
- `dispute`: `TransferDispute` - The resulting transfer dispute record
- `encodedInitialState`: `bytes` - The initial state used to defund transfer
- `encodedInitialState`: `bytes` - The transfer resolver used to defund transfer
- `balance`: `Balance` - The balance transferred during the transfer defund process.

## ChannelFactory

Allows us to create new channel proxy contract

### getMastercopy

Returns the `ChannelMastercopy` (vector channel logic) address associated with the `ChannelFactory`

#### Params

None

#### Returns

`address`

### getChainId

Returns the `chainId` used in the salt to calculate the CREATE2 channel address. If there is a stored `chainId`, it will return that value otherwise returns the value from the `chainId` opcode. The stored value is used to account for chains that do not correctly implement the opcode

#### Params

None

#### Returns

`uint256`

### getStoredChainId

Returns the `chainId` stored by the factory (set at deployment)

#### Params

None

#### Returns

`uint256`
### getProxyCreationCode

Returns the proxy code used to both calculate the CREATE2 address and deploy the channel proxy pointed to the `ChannelMastercopy`

#### Params

None

#### Returns

`bytes`

### getChannelAddress

Returns the CREATE2 address for the deployed channel multisig for `alice` and `bob`

#### Params

- `alice`: `address` - the signing address of `alice` in the channel
- `bob`: `address` - the signing address of `bob` in the channel

#### Returns

`address` when the multisig would be deployed

### createChannel

Deploys and sets the owners of the channel multisig for a given `alice` and `bob`

#### Params

- `alice`: `address` - the signing address of `alice` in the channel
- `bob`: `address` - the signing address of `bob` in the channel

#### Returns

`address` of the deployed multisig

### createChannelAndDepositAlice

Deploys, sets up, and calls `depositAlice` on a channel multisig. Must have the `deposit` value sent along with the message (if depositing ETH), or approved for spending by the `ChannelFactory`

#### Params

- `alice`: `address` - the signing address of `alice` in the channel
- `bob`: `address` - the signing address of `bob` in the channel
- `assetId`: `address` - the asset of `alice`'s channel deposit
- `amount`: `uint256` - the value of `alice`'s channel deposit

#### Returns

`address` of the deployed multisig

## ChannelMastercopy

Hosts all the onchain logic used by the channel multisigs. All deployed channel proxies will point to this onchain contract.

### setup

#### Params

#### Returns

### getAlice

#### Params

#### Returns

### getBob

#### Params

#### Returns

### getTotalTransferred

#### Params

#### Returns

### getEmergencyWithdrawableAmount

#### Params

#### Returns

### emergencyWithdraw

#### Params

#### Returns

### getTotalDepositsAlice

#### Params

#### Returns

### getTotalDepositsBob

#### Params

#### Returns

### depositAlice
#### Params

#### Returns

### getWithdrawalTransactionRecord

#### Params

#### Returns

### withdraw

#### Params

#### Returns

### getChannelDispute

#### Params

#### Returns

### getDefundNonce

#### Params

#### Returns

### getTransferDispute

#### Params

#### Returns

### disputeChannel

#### Params

#### Returns

### defundChannel

#### Params

#### Returns

### disputeTransfer

#### Params

#### Returns

### defundTransfer

#### Params

#### Returns

## TransferRegistry

The `TransferRegistry` maintains an onchain record of all supported transfers (specifically holds the registry information defined within the contracts). The offchain protocol uses this information to get the correct encodings when generating signatures. The information stored here can only be updated by the owner of the contract

### getTransferDefinitions

Returns all registered transfers supported by the registry.
#### Params

None

#### Returns

`RegisteredTransfer[]`: An array of all the transfers supported by the registry

### addTransferDefinition

Adds a new `RegisteredTransfer` to the registry. May only be called by registry owner

#### Params

- `RegisteredTransfer`: The transfer to add to the registry

#### Returns

None

### removeTransferDefinition

Removes a supported transfer from the registry. May only be called by registry owner
#### Params

- `string`: The registered name of the transfer to remove

#### Returns

None
