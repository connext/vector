# Node API Reference
There is one consolidated API across both the `server-node` and `browser-node`. Server nodes expose that interface via HTTP and gRPC (coming soon), and we additionally have [an example TS "client"](./modules/utils/src/serverNode.ts) which wraps the HTTP methods. The browser node exposes a TS interface only.

## Base Objects

### Balance

`Balance`: `object` - contains:

- `to`: `string[]` - Signing keys of channel participants ordered by channel `[initiator, responder]`.
- `amount`: `string[]` - Amount of balance for the given assetId, ordered by channel `[initiator, responder]`.

### Full Channel State

`FullChannelState`: `object` - contains:

-   `assetIds`: `string[]` - Array of assetIds for assets that are managed by this channel. 
-   `balances`: `object[]` - Array of [Balance](#balance) objects indexed by the above `assetIds` array.
-   `channelAddress`: `string` - Unique onchain address of the channel.
-   `alice`: `string` - Signing key of channel initiator, i.e. the party that first called `setup`.
-   `bob`: `string` - Signing key of channel responder, i.e. the party who responded to `setup`.
-   `merkleRoot`: `string` - Root hash containing merkelized data from active transfers and balances. Used by the onchain contracts as part of disputing.
-   `nonce`: `number` - Monotonically increasing number which is incremented for every update to the channel. Used by the onchain contracts as part of disputing.
-   `processedDepositsA`: `string[]` - Offchain tracker of total amount of deposits reconciled into the channel balance for the channel initiator, indexed by `assetIds` array above. used by onchain contracts as part of disputing.
-   `processedDepositsB`: `string[]` - Offchain tracker of total amount of deposits reconciled into the channel balance for the channel responder, indexed by `assetIds` array above. used by onchain contracts as part of disputing.
-   `timeout`: `string` - Timeout within which onchain disputes are settled designated as number of blocks.
-   `aliceIdentifier`: `string` - Public identifier of the channel initiator.
-   `bobIdentifier`: `string` - Public identifier of the channel responder.
-   `latestUpdate`: `object` - Latest update that was mutually agreed on in the channel by both parties.
-   `networkContext`: `object` - Chain specific data used for disputing. Includes:
    -   `channelFactoryAddress`: `string` - Address of `ChannelFactory.sol` contract for the chain that this channel is on.
    -   `channelMastercopyAddress`: `string` - Address of `ChannelMastercopy.sol` contract for the chain that this channel is on.
    -   `transferRegistryAddress`: `string` - Address of `TransferRegistry.sol` contract for the chain that this channel is on.
    -   `chainId`: `number` - [Chainid](https://chainid.network) of the chain that this channel is on.
    -   `providerUrl`: `string` - Chain provider that this node instance was initiated with (associated with this chainId).

### Full Transfer State

`FullTransferState`: `object` - contains:

- `balance`: `object` - [Balance](#balance) object.
- `assetId`: `string` - Id of the asset that is being sent as part of this transfer.
- `channelAddress`: `string` - Unique onchain address of the channel.
- `transferId`: `string` - Unique identifier associated with this transfer.
- `transferDefinition`: `string` - Onchain address of the contract logic that will be used to govern this transfer.
- `transferTimeout`: `string` - Transfer-specific dispute timeout within which the transfer state must be settled onchain.
- `initialStateHash`: `string` - Hash of the initial state of the transfer as defined in the `transferDefinition` contract.
- `initiator`: `string` - Signing key of the initiator of the transfer (the peer that calls `conditionalTransfer`).
- `responder`: `string` - Signing key of the responder of the transfer (the peer that calls `resolveTransfer`).
- `channelFactoryAddress`: `string` - Address of the `ChannelFactory.sol` contract.
- `chainId`: `number` - Unique id of the chain that this channel is on.
- `transferEncodings`: `string[]` - [ABIEncoderV2] encodings for `[transferState, transferResolver]`.
- `transferState`: Initial state of the transfer as defined in the `transferDefinition` contract.
- `transferResolver`: Data needed to resolve the transfer as defined in the `transferDefinition` contract.
- `meta`: `object` - User-defined object for optional metadata sent along with the transfer (e.g. Invoice number, messages, etc.)

## Core Methods

### createNode

!!! Warning
    `createNode` is a `server-node` **only** method. It is not relevant to the `browser-node`. See the [indexed engines](../node/basics.md#indexed-engines) documentation for details.

Creates a new node engine (i.e. a new `signer` + `publicIdentifier`) at the given index.

!!! example
    === "TS" 

        ``` typescript
        const result = await node.createNode({
            index: 0
        });
        ```

    === "HTTP"

        ``` http
        ##############
        ### CREATE NODE
        POST {{nodeUrl}}/node
        Content-Type: application/json

        {
            "index": 0
        }
        ```

#### Params

`ServerNodeParams.CreateNode` object. Contains:

- `index`: `number` - used as part of the path along which a new key will be derived. This key is then used to create a new signer/public identifier/node engine. 

#### Returns

EITHER `ServerNodeResponses.CreateNode` object. Contains:

- `publicIdentifier`: Unique Connext-specific identifier for the node.
- `signerAddress`: Address of the key that is used to to sign messages in the channel. This is linked 1:1 with the `publicIdentifier`.
- `index`: Derivation index, same as what was passed in as a param.

OR [NodeError](https://github.com/connext/vector/blob/master/modules/types/src/error.ts#L177)


### setup

// TODO setup is being with `requestSetup`, what are the latest params?

Creates a channel with a given counterparty.

!!! example
    === "TS" 

        ``` typescript
        const result = await node.setup({
            chainId: 1 // Ethereum
            counterpartyPublicIdentifier: "indra123ABC..."
        });
        ```

    === "HTTP"

        ``` http
        ##############
        ### Setup Channel
        POST {{nodeUrl}}/setup
        Content-Type: application/json

        {
            "counterpartyPublicIdentifier": "indra123ABC...",
            "chainId": 1,
        }
        ```

#### Params

`ServerNodeParams.Setup` object. Contains:

- `chainId`: `number` - [chainId](https://chainid.network) of the chain on which the channel will be created.
- `counterpartyIdentifier`: `string` - Identifier of the peer that you want to open a channel to.
// TODO: make timeout optional
- `timeout`: `string` - (Optional) Onchain dispute timeout of the channel in blocks.

#### Returns

EITHER `ServerNodeResponses.Setup` object. Contains:

- `channelAddress`: Unique onchain address of the new channel.

OR [NodeError](https://github.com/connext/vector/blob/master/modules/types/src/error.ts#L177)

### reconcileDeposit

Reconciles an onchain deposit with your offchain balance. It is assumed when calling this function that a deposit tx to your `channelAddress` has already occurred and been mined.

!!! example
    === "TS" 

        ``` typescript
        const result = await node.reconcileDeposit({
            channelAddress: "0xABC123...",
            assetId: "0x0000000000000000000000000000000000000000" // "0x0" == Base asset of whatever chain the channel is on, e.g $ETH
        });
        ```

    === "HTTP"

        ``` http
        ##############
        ### Reconcile Deposit
        POST {{nodeUrl}}/deposit
        Content-Type: application/json

        {
            "channelAddress": "0xABC123...",
            "assetId": "0x0000000000000000000000000000000000000000"
        }
        ```

#### Params

`ServerNodeParams.Deposit` object. Contains:

- `channelAddress`: `string` - Unique onchain address of your channel. This should be the same address that the onchain funding tx was sent to.
- `assetId`: `string` - Address of the asset on whatever chain your channel is on. For instance, the ERC20 contract address for a token on Ethereum. We use `0x0000000000000000000000000000000000000000` to represent the base asset of the chain, e.g. $ETH on `chainId == 1`

#### Returns

EITHER `ServerNodeResponses.Deposit` object. Contains:

- `channelAddress`: `string` - Unique onchain address of your channel.

OR [NodeError](https://github.com/connext/vector/blob/master/modules/types/src/error.ts#L177)

### conditionalTransfer

Creates a conditional transfer to a given counterparty, locking up the transfer balance and setting some logic by which the transfer will be unlocked. See [Transfers](../node/transfers.md) for more information.

!!! example
    === "TS" 

        ``` typescript
        const result = await node.conditionalTransfer({
            type: "HashlockTransfer",
            channelAddress: "0xABC123...",
            amount: "1000000000000000", // 0.01 ETH
            assetId: "0x0000000000000000000000000000000000000000",
            details: {
                lockHash: "0xlockHash...",
                expiry: "0"
            },
            recipient: "indra123ABC...",
            meta: {
                hello: "world"
            }
        });
        ```

    === "HTTP"

        ``` http
        ##############
        ### Create Transfer ETH
        POST {{nodeUrl}}/transfers/create
        Content-Type: application/json

        {
            "type": "HashlockTransfer",
            "channelAddress": "0xABC123...",
            "amount": "1000000000000000", # 0.01 ETH
            "assetId": "0x0000000000000000000000000000000000000000",
            "details": {
                "lockHash": "0xlockHash...",
                "expiry": "0"
            },
            "recipient": "indra123ABC...",
            "meta": {
                "hello": "world"
            }
        }
        ```

#### Params

`ServerNodeParams.ConditionalTransfer` object. Contains:

- `channelAddress`: `string` - Unique onchain address of the channel in which the transfer will be executed.
- `amount`: `string` - Amount to be transferred represented in decimal-free units. For instance, with $ETH we should use [wei units](https://eth-converter.com).
- `assetId`: `string` - Address of the asset on whatever chain your channel is on. For instance, the ERC20 contract address for a token on Ethereum. We use `0x0000000000000000000000000000000000000000` to represent the base asset of the chain, e.g. $ETH on `chainId == 1`
- `recipient`: `string` - Identifier of the peer that you want to transfer to.
// TODO where do we have a list of transfernames?
- `type`: `string` - Either of a hardcoded `TransferName` if the transfer type is officially supported by Connext, OR a `transferDefinition`, which is the onchain address of the logic which will be used to govern the transfer.
- `details`: `object` - initial state of the transfer, used to set up the conditions which are used to unlock the transfer. This should be exactly the same as the `TransferState` defined in your `transferDefinition` contract.
- `recipientChainId`: `number` - (Optional) [chainId](https://chainid.network) of chain on which the recipient is located. The recipient's channel does not need to be on the same chain as the sender's channel - for example, you could send a transfer from Alice on Ethereum to Bob on Matic. If `recipientChainId` is not provided, it will default to the `chainId` of the sender's channel.
- `recipientAssetId`: `string` - (Optional) Similar to `recipientChainId`, the `assetId` that the recipient receives a transfer in does not need to be the same as the asset that the transfer is sent in. If intermediary routers are willing to provide liquidity, Alice can send a transfer in $ETH which can be receives by Bob in $DAI. If `recipientAssetId` is not provided, it will default to the `assetId` above.
- `meta`: `object` - (Optional) User-defined object for any additional metadata to be sent with the transfer creation e.g. Invoice numbers, messages, etc.

#### Returns

EITHER `ServerNodeResponses.ConditionalTransfer` object. Contains:

- `channelAddress`: `string` - Unique onchain address of your channel.
- `transferId`: `string` - Unique identifier for a given transfer.

OR [NodeError](https://github.com/connext/vector/blob/master/modules/types/src/error.ts#L177)

### resolveTransfer

Unlocks a transfer from a counterparty by passing in whatever params are needed to resolve the condition defined in a corresponding `conditionalTransfer`. Note that if Alice creates a conditional transfer to Bob, only Bob can `resolveTransfer` on it.

!!! example
    === "TS" 

        ``` typescript
        const result = await node.resolveTransfer({
            channelAddress: "0xABC123...",
            transferId: "0xtransferId...",
            transferResolver: {
                preImage: "0xpreimage..." // For hashlock transfer
            }
        });
        ```

    === "HTTP"

        ``` http
        ##############
        ### Resolve Transfer
        POST {{nodeUrl}}/transfers/resolve
        Content-Type: application/json

        {
            "channelAddress": "0xABC123...",
            "transferId": "0xtransferId...",
            "transferResolver": {
                "preImage": "0xpreimage..." # For hashlock transfer
            }
        }
        ```

#### Params

`ServerNodeParams.ResolveTransfer` object. Contains:

- `channelAddress`: `string` - Unique onchain address of the channel in which a conditional transfer has been received.
- `transferId`: `string` - Unique identifier of the received conditional transfer.
- `transferResolver`: `object` - params needed to resolve the conditional transfer. This should be exactly the same as the `TransferResolver` defined in your `transferDefinition` contract.
- `meta`: `object` - (Optional) User-defined object for any additional metadata to be sent with the transfer resolution e.g. Invoice numbers, messages, etc.

#### Returns

EITHER `ServerNodeResponses.ResolveTransfer` object. Contains:

- `channelAddress`: `string` - Unique onchain address of your channel.
- `transferId`: `string` - Unique identifier for a given transfer.

OR [NodeError](https://github.com/connext/vector/blob/master/modules/types/src/error.ts#L177)

### withdraw

A special kind of conditional transfer that sends assets in your channel to a specified onchain address. Can optionally include a fee as part of the withdraw which is charged by the counterparty if they submit the transaction on behalf of the withdrawer (i.e. if the counterparty is performing a [metatransaction](https://medium.com/@austin_48503/ethereum-meta-transactions-90ccf0859e84) to remove the withdrawer's need to pay gas)

!!! example
    === "TS" 

        ``` typescript
        const result = await node.withdraw({
            channelAddress: "0xABC123...",
            amount: "1000000000000000", // 0.01 ETH,
            assetId: "0x0000000000000000000000000000000000000000",
            recipient: "0xmyAddress...",
            fee: "10000000000" // 10 gWei
        });
        ```

    === "HTTP"

        ``` http
        ##############
        ### Alice Withdraw
        POST {{nodeUrl}}/withdraw
        Content-Type: application/json

        {
            "channelAddress": "0xABC123...",
            "amount": "1000000000000000", # 0.01 ETH
            "assetId": "0x0000000000000000000000000000000000000000",
            "recipient": "0xmyAddress...",
            "fee": "10000000000" # 10 gWei
        }
        ```

#### Params

`ServerNodeParams.Withdraw` object. Contains:

- `channelAddress`: `string` - Unique onchain address of the channel in which a conditional transfer has been received.
- `amount`: `string` - Amount to be withdrawn from channel in decimal-free units. For instance, for $ETH, we would use [wei](https://eth-converter.com/).
- `assetId`: `string` - Address of the asset on whatever chain your channel is on. For instance, the ERC20 contract address for a token on Ethereum. We use `0x0000000000000000000000000000000000000000` to represent the base asset of the chain, e.g. $ETH on `chainId == 1`
- `recipient`: `string` - Onchain address to which the withdraw will be made.
- `fee`: `string` - (Optional) Fee that will be charged by the counterparty for the withdraw. It's up to the counterparty to implement validation logic to verify that the correct fee is being supplied by the caller. Fee is also in decimal-free units, just like `amount`.

#### Returns

EITHER `ServerNodeResponses.Withdraw` object. Contains:

- `channelAddress`: `string` - Unique onchain address of your channel.
- `transferId`: `string` - Unique identifier for the withdraw.

OR [NodeError](https://github.com/connext/vector/blob/master/modules/types/src/error.ts#L177)

## Getters and Static Properties

### publicIdentifier

Unique identifier associated with your identity - 1:1 mapped with your signing key.

!!! example
    === "TS"

        ``` typescript
        const result = node.publicIdentifier;
        ```

    === "HTTP"
        ``` http
        ## TODO
        ```

#### Params

None

#### Returns

- `publicIdentifier`: `string`

### signerAddress

Public address of your signing key - 1:1 mapped with your public identifier.

!!! example
    === "TS"

        ``` typescript
        const result = node.signerAddress;
        ```

    === "HTTP"
        ``` http
        ## TODO
        ```

#### Params

None

#### Returns

- `signerAddress`: `string`

### getStateChannelByParticipants

Gets a channel given the participant public identifiers of that channel.

!!! example
    === "TS"

        ``` typescript
        const result = await node.getStateChannelByParticipants({
            publicIdentifier: "indra123MyId...",
            counterparty: "indra456TheirId...",
            chainId: 1 // Ethereum
        });
        ```

    === "HTTP"

        ``` http
        ##############
        ### getChannelByParticipants
        GET {{nodeUrl}}/indra123MyId.../channels/counterparty/indra456TheirId.../chain-id/1
        ```

#### Params

`ServerNodeParams.GetChannelStateByParticipants` object. Contains:

- `publicIdentifier`: `string` - Your unique Connext-specific identifier.
- `counterparty`: `string` - Counterparty's unique Connext-specific identifier.
- `chainId`: `number` - - [chainId](https://chainid.network) of the chain on which the channel was created.

#### Returns

`ServerNodeResponses.GetChannelStateByParticipants` object. Contains:

- `FullChannelState`: `object` - [Channel state](#full-channel-state).

### getStateChannels

Gets all state channels in your store associated with your signer/public identifier.

!!! example
    === "TS"

        ``` typescript
        const result = await node.getStateChannels();
        ```

    === "HTTP"

        ```http
        ##############
        ### GET CHANNELS
        GET {{nodeUrl}}/channel
        ```

#### Params

None

#### Returns

`ServerNodeResponses.GetChannelStates` object. Contains:

- `FullChannelState[]`: `object[]` - Array of [channel states](#full-channel-state).

### getStateChannel

Gets a channel given its `channelAddress`.

!!! example
    === "TS"

        ``` typescript
        const result = await node.getStateChannel({
            channelAddress: "0xABC123..."
        });
        ```

    === "HTTP"

        ```http
        ##############
        ### GET CHANNEL
        GET {{nodeUrl}}/channel/0xABC123...
        ```

#### Params

`ServerNodeParams.GetChannelState` object. Contains:

- `channelAddress`: `string` - Unique onchain address of your channel

#### Returns

EITHER `ServerNodeResponses.GetChannelState` object. Contains:

- `FullChannelState`: `object` - [Channel state](#full-channel-state).

OR [NodeError](https://github.com/connext/vector/blob/master/modules/types/src/error.ts#L177)

### getTransfer

Gets a transfer given its `transferId`.

!!! example
    === "TS"

        ``` typescript
        const result = await node.getTransfer({
            transferId: "0xtransferId..."
        });
        ```

    === "HTTP"

        ```http
        ##############
        ### GET TRANSFER
        GET {{nodeUrl}}/transfer/0xtransferId...
        ```

#### Params

`ServerNodeParams.GetTransferState` object. Contains:

- `transferId`: `string` - Unique id of transfer

#### Returns

EITHER `ServerNodeResponses.GetTransferState` object. Contains:

- `FullTransferState`: `object` - [Transfer state](#full-transfer-state).

OR [NodeError](https://github.com/connext/vector/blob/master/modules/types/src/error.ts#L177)


### getActiveTransfers

Gets all active transfers for a given channel address.

!!! example
    === "TS"

        ``` typescript
        const result = await node.getActiveTransfers({
            channelAddress: "0xABC123..."
        });
        ```

    === "HTTP"

        ```http
        ## TODO
        ```
#### Params

`ServerNodeParams.GetActiveTransfersByChannelAddress` object. Contains:

- `channelAddress`: `string` - Unique onchain address of your channel.

#### Returns

EITHER `ServerNodeResponses.GetActiveTransfersByChannelAddress` object. Contains:

- `FullTransferState[]`: `object[]` - Array of [transfer states](#full-transfer-state).

OR [NodeError](https://github.com/connext/vector/blob/master/modules/types/src/error.ts#L177)

## Event Handler Methods

## Event Types and Payloads

### Setup

`"SETUP"` - Emitted on channel setup.

#### Payload

`SetupPayload` object. Contains:

- `channelAddress`: `string` - Unique onchain address of your channel.
- `aliceIdentifier`: `string` - Connext-specific identifier associated with the initiator of the channel (i.e. the peer that called `setup`).
- `bobIdentifier`: `string` - Connext-specific identifier associated with the responded of the channel (i.e. the peer that responded to `setup`).
- `chainId`: `number` - [Chainid](https://chainid.network) that the channel has been set up on.

### Conditiona Transfer Created

`"CONDITIONAL_TRANSFER_CREATED"` - Emitted on creation of a conditional transfer.

#### Payload

`ConditionalTransferCreatedPayload` object. Contains:

- `aliceIdentifier`: `string` - Connext-specific identifier associated with the initiator of the channel (i.e. the peer that called `setup`).
- `bobIdentifier`: `string` - Connext-specific identifier associated with the responded of the channel (i.e. the peer that responded to `setup`).
- `channelAddress`: `string` - Unique onchain address of your channel.
- `transfer`: `FullTransferState` - [Full transfer state](#full-transfer-state).
- `channelBalance`: `Balance` - [Balance](#balance).
- `conditionType`: `string` - Either of a hardcoded `TransferName` for a transfer supported by default in connext OR a `transferDefinition` address for a custom transfer.

### Conditional Transfer Resolved

`"CONDITIONAL_TRANSFER_RESOLVED"` - Emitted on resolve of a conditional transfer.

#### Payload

`ConditionalTransferResolvedPayload` object. Contains:

- `aliceIdentifier`: `string` - Connext-specific identifier associated with the initiator of the channel (i.e. the peer that called `setup`).
- `bobIdentifier`: `string` - Connext-specific identifier associated with the responded of the channel (i.e. the peer that responded to `setup`).
- `channelAddress`: `string` - Unique onchain address of your channel.
- `transfer`: `FullTransferState` - [Full transfer state](#full-transfer-state).
- `channelBalance`: `Balance` - [Balance](#balance).
- `conditionType`: `string` - Either of a hardcoded `TransferName` for a transfer supported by default in connext OR a `transferDefinition` address for a custom transfer.

### Deposit Reconciled

`"DEPOSIT_RECONCILED"` - Emitted after a channel party reconciles a deposit.

#### Payload

`DepositReconciledPayload` object. Contains:

- `aliceIdentifier`: `string` - Connext-specific identifier associated with the initiator of the channel (i.e. the peer that called `setup`).
- `bobIdentifier`: `string` - Connext-specific identifier associated with the responded of the channel (i.e. the peer that responded to `setup`).
- `channelAddress`: `string` - Unique onchain address of your channel.
- `channelBalance`: `Balance` - [Balance](#balance).
- `assetId`: `string` - Address of the asset onchain. E.g. ERC20 token address. We use `0x0` for the base asset of the chain ($ETH on Ethereum).

### Withdrawal Created

`"WITHDRAWAL_CREATED"` - Emitted after a withdraw is initiated with a counterparty.

#### Payload

`WithdrawalCreatedPayload` object. Contains:

- `aliceIdentifier`: `string` - Connext-specific identifier associated with the initiator of the channel (i.e. the peer that called `setup`).
- `bobIdentifier`: `string` - Connext-specific identifier associated with the responded of the channel (i.e. the peer that responded to `setup`).
- `channelAddress`: `string` - Unique onchain address of your channel.
- `transfer`: `FullTransferState` - [Full Transfer State](#full-transfer-state)
- `fee`: `string` - Fee submitted by withdraw initiator.
- `assetId`: `string` - Address of the asset onchain. E.g. ERC20 token address. We use `0x0` for the base asset of the chain ($ETH on Ethereum).
- `amount`: `string` - Amount to be withdrawn in decimal-free units. E.g. wei for $ETH
- `recipient`: `string` - Onchain address that the withdrawn amount will be sent to.
- `channelBalance`: `Balance` - Updated [balance](#balance) for the above assetId.

### Withdrawal Resolved

`"WITHDRAWAL_RESOLVED"` - Emitted after a withdraw has been completed and a signed commitment to sent funds onchain has been successfully generated.

#### Payload

`WithdrawalResolvedPayload` object. Contains:

- `aliceIdentifier`: `string` - Connext-specific identifier associated with the initiator of the channel (i.e. the peer that called `setup`).
- `bobIdentifier`: `string` - Connext-specific identifier associated with the responded of the channel (i.e. the peer that responded to `setup`).
- `channelAddress`: `string` - Unique onchain address of your channel.
- `transfer`: `FullTransferState` - [Full Transfer State](#full-transfer-state)
- `fee`: `string` - Fee submitted by withdraw initiator.
- `assetId`: `string` - Address of the asset onchain. E.g. ERC20 token address. We use `0x0` for the base asset of the chain ($ETH on Ethereum).
- `amount`: `string` - Amount to be withdrawn in decimal-free units. E.g. wei for $ETH
- `recipient`: `string` - Onchain address that the withdrawn amount will be sent to.
- `channelBalance`: `Balance` - Updated [balance](#balance) for the above assetId.

### Withdrawal Reconciled

`"WITHDRAWAL_RECONCILED"` - Emitted after a withdraw commitment has been successfully sent to chain.

#### Payload

`WithdrawalReconciledPayload` object. Contains:

- `aliceIdentifier`: `string` - Connext-specific identifier associated with the initiator of the channel (i.e. the peer that called `setup`).
- `bobIdentifier`: `string` - Connext-specific identifier associated with the responded of the channel (i.e. the peer that responded to `setup`).
- `channelAddress`: `string` - Unique onchain address of your channel.
- `transactionHash`: `string` - Onchain transaction hash of submitted withdraw tx.
- `transferId`: `string` - Unique id associated with this withdraw.
