# Vector Engine

The engine wraps the core Vector protocol. It implements business logic for some default types of conditional transfers, converts user-facing parameters/events to protocol parameters/events, and exposes a JSON RPC interface that is consumed by the `server-node`, `browser-node` or any other node implementation.

Note: because the engine runs behind a JSON RPC interface, it is entirely possible to run the core protocol (incl keys, access to services, etc.) in an isolated environment such as a browser iframe, and then only expose limited functionality for interacting with a user's channel to the outside world. We believe this is the safest way to enable state channel applications that run in the browser.

Contents:

- [Developing and Running Tests](#developing-and-running-tests)
- [JSON RPC Interface](#json-rpc-interface)
- Events // TODO

## Developing and Running Tests

In `~/vector` (root), run:

- `make engine` to build the protocol
- `make test-engine` to run the unit tests

## JSON RPC Interface

Methods:

- [chan_setup](#chan_setup)
- [chan_deposit](#chan_deposit)
- [chan_createTransfer](#chan_createTransfer)
- [chan_resolveTransfer](#chan_resolveTransfer)
- [chan_withdraw](#chan_withdraw)
- [chan_getChannelState](#chan_getChannelState)
- [chan_getTransferStateByRoutingId](#chan_getTransferStateByRoutingId)
- [chan_getChannelStateByParticipants](#chan_getChannelStateByParticipants)
- [chan_getChannelStates](#chan_getChannelStates)

### Example Usage

Request

```
curl --data '{"method":"chan_setup","params":[...],"id":1,"jsonrpc":"2.0"}' -H "Content-Type: application/json" -X POST localhost:8545
```

Note: remember to populate `params` and `method` with the correct fields above.

Response

```
{
  "id": 1,
  "jsonrpc": "2.0",
  "result": [
    {
        ...
    },
    ...
  ]
}
```

### chan_setup

Creates a channel with a given counterparty.

#### Params

1. `Object` - EngineParams.Setup object.
   - `counterpartyIdentifier`: `String` - Connext-specific counterparty public identifier.
   - `chainId`: `Number` - ChainId of the chain that you want to create a channel on.
   - `timeout`: `String`- (optional) Dispute timeout for the channel. // TODO must be greater than [MIN_TIMEOUT](https://github.com/connext/vector/blob/master/modules/types/src/constants.ts#L2) and lower than 2\*DEFAULT_TIMEOUT

#### Returns

- `Object` - [FullChannelState](https://github.com/connext/vector/blob/master/modules/types/src/channel.ts#L102) object.

### chan_deposit

Reconciles a deposit that was completed onchain with the offchain channel balance.

NOTE: this method assumes you have first completed the deposit onchain either by sending a tx to `contract.depositA` if you are Alice in the channel or sending funds directly to the address if you are Bob. See the note on [Depositing and Withdrawing](https://github.com/connext/vector/tree/master/modules/contracts#depositing-and-withdrawing) to learn more.

#### Params

1. `Object` - EngineParams.Deposit object.
   - `channelAddress`: `String` - Onchain address of the specific channel that you have deposited to.
   - `assetId`: `String` - Address of the asset (ERC20 token or equivalent) that you deposited. Use `ethers.constants.AddressZero` (i.e. `address(0)`) for the chain's base asset (e.g. Eth).

#### Returns

- `Object` - [FullChannelState](https://github.com/connext/vector/blob/master/modules/types/src/channel.ts#L102) object.

### chan_createTransfer

Creates a conditional transfer with the specified counterparty.

#### Params

1. `Object` - EngineParams.ConditionalTransfer object
   - `channelAddress`: `String` - Address of channel from which the transfer will be made.
   - `conditionType`: `String` - Type of condition which will be used to resolve the transfer. See [TransferName](https://github.com/connext/vector/blob/master/modules/types/src/transferDefinitions/shared.ts#L16),
   - `amount`: `String` - Amount to be locked in the transfer by sender.
   - `assetId`: `String` - Onchain address of asset (ERC20 or equivalent). Use `ethers.constants.AddressZero` for the chain's base asset (e.g. Eth).
   - `recipient`: `String` - Recipient Connext-specific public identifier
   - `details`: `Object` - TransferType-specific params needed to set up the conditions for the transfer. For instance, `linkedHash` for `LinkedTransfer`. See the [schemas](https://github.com/connext/vector/blob/master/modules/types/src/schemas/engine.ts#L75) to learn more.
   - `recipientChainId`: `Number` - (optional) ChainId of recipient for cross-chain transfers. If none is provided, the engine will assume that the recipient chainId is the same as sender chainId.
   - `recipientAssetId`: `String` - (optional) AssetId of recipient for transfers that include an in-flight swap of assets. If nothing is provided, the engine will assume that the recipient assetId is the same as sender assetId.
   - `timeout`: `String` (optional) Dispute timeout of transfer. Defaults to [DEFAULT_TIMEOUT](https://github.com/connext/vector/blob/master/modules/types/src/constants.ts#L1)
   - `meta`: `Object` (optional) User defined object that can contain transfer metadata, invoice number, message, etc.

#### Returns

- `Object` - [FullChannelState](https://github.com/connext/vector/blob/master/modules/types/src/channel.ts#L102) object.

### chan_resolveTransfer

Resolves an existing conditional transfer using logic that finalizes/unlocks it.

#### Params

1. `Object` - EngineParams.ResolveTransfer object
   - `channelAddress`: `String` - Address of channel which contains the transfer to be resolved.
   - `routingId`: `String` - Unique Id associated with this transfer. Can get this by listening for the `CONDITIONAL_TRANSFER_CREATED` event.
   - `conditionType`: `String` - Condition type of this transfer // TODO do we need this?
   - `details`: `Object` - TransferType-specific params needed to resolve the conditions for the transfer. For instance, `preImage` for `LinkedTransfer`. See the [schema](https://github.com/connext/vector/blob/master/modules/types/src/schemas/engine.ts#L96) to learn more.

#### Returns

- `Object` - [FullChannelState](https://github.com/connext/vector/blob/master/modules/types/src/channel.ts#L102) object.

### chan_withdraw

Withdraws funds from the channel to a specified address onchain. Note that the withdraw onchain tx itself may be submitted by the counterparty.

#### Params

1. `Object` - EngineParams.Withdraw object.
   - `channelAddress`: `String` - Address of channel from which the withdraw will be made.
   - `amount`: `String` - Amount to be withdrawn // TODO what units is this in?
   - `assetId`: `String` - Onchain address of asset (ERC20 or equivalent). Use `ethers.constants.AddressZero` for the chain's base asset (e.g. Eth).
   - `recipient`: `String` - Onchain address to send funds to.
   - `fee`: `String` - (optional) Fee charged by counterparty to submit a withdrawal on your behalf to chain. If the counterparty is submitting your withdrawal and doesn't charge a fee, this is not needed. If they are submitting your withdrawal and _do_ charge a fee, adding an incorrect fee will cause the withdraw call to throw an error.

#### Returns

- `Object` - [FullChannelState](https://github.com/connext/vector/blob/master/modules/types/src/channel.ts#L102) object.
- // TODO do we need to add txHash here?

### chan_getChannelState

Gets channel state for a given `channelAddress`.

#### Params

1. `Object` - EngineParams.GetChannelState object.
   - `channelAddress`: `String` - Address of channel.

#### Returns

- `Object` - [FullChannelState](https://github.com/connext/vector/blob/master/modules/types/src/channel.ts#L102) object.

### chan_getTransferStateByRoutingId

Gets a transfer state for a given `routingId`.

#### Params

1. `Object` - EngineParams.GetTransferStateByRoutingId object.
   - `routingId`: `String` - Unique Id of transfer.

#### Returns

- `Object` - [FullTransferState](https://github.com/connext/vector/blob/master/modules/types/src/channel.ts#L129) object.

### chan_getChannelStateByParticipants

Gets channel state for a given `alice` and `bob` public identifiers.

#### Params

1. `Object` - EngineParams.GetChannelStateByParticipants object.
   - `alice`: `String` - Connext-specific public identifier of the channel initiator.
   - `bob`: `String` - Connext-specific public identifier of the channel responder.
   - `chainId`: `Number` - Id of the chain that the channel is on.

#### Returns

- `Object` - [FullChannelState](https://github.com/connext/vector/blob/master/modules/types/src/channel.ts#L102) object.

### chan_getChannelStates

Gets all channel states associated with your public identifier in your store.

#### Params

None.

#### Result

- `Object[]` - Array of [FullChannelState](https://github.com/connext/vector/blob/master/modules/types/src/channel.ts#L102) objects.
