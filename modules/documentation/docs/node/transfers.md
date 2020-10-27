# Transfers

A `transfer` is the primary mechanism by which a Connext channel is updated.

Transfers have a fixed lifecycle:

1. Alice creates a conditional transfer with Bob by calling `conditionalTransfer()`. The function takes in details around the value to be transferred (`amount`, `assetId`, `recipient`), as well as a `transferDefinition` and a `details` object (which is the initial state of the transfer). Doing this locks up Alice's funds corresponding to the `amount` above, making it so that they can only be unlocked by meeting the conditions specified within the `transferDefinition`.
2. Bob calls `resolveTransfer()` which takes in a globally unique `transferId` associated with the above transfer, as well as a `transferResolver`, which is an object containing data needed to unlock the transfer.

## Transfer Definitions

Transfer definitions specify the logic by which value locked in a transfer can be resolved into an updated set of balances. The ability to specify different `transferDefinitions` when creating a conditional transfer is what makes sending value using Connext programmable!

To remove the need to write custom offchain code when adding support for new types of conditional transfers, we implement `transferDefinition`s as singleton Solidity contracts and pass in their deployed contract address when creating a conditional transfer. Transfer definitions always implement a standard interface:

!!! example "Transfer definition interface"

    ```typescript
    interface ITransferDefinition {
        // Validates the initial state of the transfer.
        // Called by validator.ts during `create` updates.
        function create(bytes calldata encodedBalance, bytes calldata) external view returns (bool);

        // Performs a state transition to resolve a transfer and returns final balances.
        // Called by validator.ts during `resolve` updates.
        function resolve(
            bytes calldata encodedBalance,
            bytes calldata,
            bytes calldata
        ) external view returns (Balance memory);

        // Should also have the following properties
        // string name
        // string stateEncoding
        // string resolverEncoding
        // These properties are included on the transfer specifically
        // to make it easier for implementers to add new transfers by
        // only include a `.sol` file
        function getRegistryInformation() external view returns (RegisteredTransfer memory);
    }
    ```

[Here is an example transfer definition](https://github.com/connext/vector/blob/main/modules/contracts/src.sol/transferDefinitions/HashlockTransfer.sol) for a `HashlockTransfer`, i.e. a transfer which unlocks if the receiver provides a correct `preImage` that hashes to the same value as the `lockHash` provided on creation.

## Creating a Transfer

You can create a transfer by calling the `conditionalTransfer()` method.

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

The `type` field above can be EITHER a raw `transferDefinition` address, OR one of [several default transfer names](https://github.com/connext/vector/blob/main/modules/types/src/transferDefinitions/shared.ts#L22) that we support. The `details` field **must** match the `TransferState` struct in the `transferDefinition` solidity contract:

```c++
// Example from Hashlock Transfer
struct TransferState {
    bytes32 lockHash;
    uint256 expiry; // If 0, then no timelock is enforced
}
```

## Resolving a Transfer

As a receiver, you can learn about an incoming transfer by listening for the `CONDITIONAL_TRANSFER_CREATED` event.

=== "TS" 

    ``` typescript
    await node.on(
        EngineEvents.CONDITIONAL_TRANSFER_CREATED,
        async data => {
            console.log(`Received conditional transfer: ${JSON.stringify(data)}`);
        },
        data => data.transfer.initiator === "indraABCD", // can filter on the data here
    );
    ```

=== "HTTP"

    ``` http
        ## TODO
    ```

Then, you can resolve (i.e. unlock) the transfer by calling the `resolveCondition()` function, passing in the `data.transferId` that you caught from the above event.

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

Similar to the conditionalTransfer `details` field, the `transferResolver` **must** exactly match the `TransferResolver` struct from the `transferDefinition` contract:

```c++
struct TransferResolver {
    bytes32 preImage;
}
```

## Transfers Across Chains and Assets

Transfers in Connext are routed over one (eventually many) intermediary routers. [Routers](../router/basics.md) are Connext server-nodes that are running automated software to forward transfers across multiple channels.

If the router that you're transferring over [supports it](../router/configure.md##setting-up-supported-chains), you can make transfers that swap across chains/assets while in-flight. In other words, a sender can send a transfer in $DAI on Ethereum, where the receiver receives $MATIC on Matic. To do this, specify the recipient asset and chainId as part of the transfer creation:

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
        recipientChainId: 137, // Matic chainId
        // Recipient assetId is relative to recipient chain. 0x0 on Matic chain is $MATIC
        recipientAssetId: "0x0000000000000000000000000000000000000000"
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
        recipientChainId: 137, // Matic chainId
        // Recipient assetId is relative to recipient chain. 0x0 on Matic chain is $MATIC
        recipientAssetId: "0x0000000000000000000000000000000000000000"
    }
    ```
If `recipientChainId` or `recipientAssetId` are not provided, then the transfer will default to assuming it needs to be sent with the sender's `chainId` and the passed in `assetId` param respectively.

## Writing Custom Transfer Definitions

One of the best things about a generalized system like Connext is the ability to specify your own custom conditional transfer logic. This lets you build new types of protocols on top of Connext that leverage our networked state channels in different ways.

Adding support for a custom conditional transfer is pretty simple! There are three core steps to doing this:
1. Design the conditional transfer and write the `transferDefinition` solidity contract.
2. Submit the new `transferDefinition` for review so that it can be added to our growing global registry of transfer types.
3. Call the new transfer with the right params in your offchain code.

### Writing the transferDefinion contract

0. In general, you don't need to be too concerned about the logistics of disputing onchain when writing a transfer. all onchain dispute logic (and the protocols that back this security) are pretty abstracted from the process of designing transfers.
1. The general pattern for a transferDef is to set up some initial condition when creating the transfer and then check that that condition is met when resolving.
2. First you should set up the `TransferState` and `TransferResolver` structs.
    - We strongly recommend you keep these as simple as possible. Only include params which will actually be checked or manipulated in the contract, and try to avoid too many nested objects. Not doing so will increase the likelihood that you encounter bugs when writing either the transferEncoding/resolverEncoding or the offchain code when calling the `conditionalTransfer` and `resolveCondition` functions.
3. Then write the `create()` function. A good strategy for doing this is to work your way down the `TransferState` struct and validate each param. The `create()` function is called when calling `conditionalTransfer()` and is **only** place where the object passed in to `details` is actually validated. So it's useful to do all the param validation you can here. E.g. check to see if inputs are zeroes/empty bytes, etc.
4. The goal of the `resolve()` function, is to take in the initial `TransferState` + initial balance and the passed in `resolver` to output a final balance. First, you should param validate all of the parts of the `TransferResolver` (you dont need to re-validate the `TransferState`). Then you should check to see if the passed in `resolver` meets some conditions set up against the initial `TransferState` - if it does, you should update the balances and return them. If not, then you should either throw an error (i.e. fail a `require()`) or just return the balance with no changes.
    - In some cases, we allow the transfer to be cooperatively cancelled by explicitly passing in an empty resolver. That way, there's a way to exit the transfer offchain if something goes wrong without needing to initiate an onchain dispute.
5. Lastly, you want to write encodings for the transfers. Check out the ABIEncoderV2 docs.

### Submitting the transferDef to our registry

We deploy and maintain an onchain registry of `transferDefinition`s

1. The above is done to ensure that routers in the network only forwarding transfers that are secure and will not lose them money. Aside from validating that the transferDef is a part of the registry, routers do not directly validate state packets themselves (which removes the need for us to make modifications to routers to support new transfers)
2. We're working on a more structured RFC process for new transfer standards. For now, if you want to add a new transferDefinition, just message us on discord so we can manualy audit your code and add it to the registry!

### Calling the new transfer

After you have written the new transferDef, deployed it, and submitted it to us for review, the next step is to call it from your offchain code.

Doing this works exactly the same way as described in the [creating a transfer](#creating-a-transfer) and [resolving a transfer](#resolving-a-transfer) sections above. Plug in your deployed `transferDefinition` address in the `type` field, and then pass in the `TransferState` in `details`. Then, when resolving, pass in the `TransferResolver` in the `transferResolver` field.