export async function setupListeners(node: any): Promise<void> { // TODO, node should be wrapper around grpc
    // Set up listener to handle transfer creation
    node.on(
        //@ts-ignore
        NodeEventName.TRANSFER_CREATED_EVENT, // TODO types
        async (data) => {
            await forwardTransferCreation(data)
        },
        (data) => data.fromIdentifier !== node.publicIdentifier
    )

    // Set up listener to handle transfer resolution
    node.on(
        //@ts-ignore
        NodeEventName.TRANSFER_RESOLVED_EVENT, // TODO types
        async (data) => {
            await forwardTransferResolution(data)
        },
        (data) => data.fromIdentifier !== node.publicIdentifier
    )

    node.on(
        //@ts-ignore
        NodeEventName.TRANSFER_CREATED_EVENT, // TODO types
        async (data) => {
            await handleCollateralization(data)
        },
        (data) => data.fromIdentifier === node.publicIdentifier
    )

    // Set up listener to handle transfer resolution
    node.on(
        //@ts-ignore
        NodeEventName.TRANSFER_RESOLVED_EVENT, // TODO types
        async (data) => {
            await handleReclaim(data)
        },
        (data) => data.fromIdentifier === node.publicIdentifier
    )

    node.on(
        //@ts-ignore
        NodeEventName.IS_ALIVE_EVENT, // TODO types
        async (data) => {
            await handleIsAlive(data)
        },
        (data) => data.fromIdentifier === node.publicIdentifier
    )
}