// TODO

// Created on every transfer update

/*

    struct CoreTransferState {
        Balance[] balances;
        address assetId;
        bytes32 transferId;
        address transferDefinition;
        uint256 transferTimeout;
        bytes32 appStateHash;
        AppStatus status; // either of CREATED or RESOLVED
        // TODO merkleProof
    }

*/

// transferId should be hash of:
// - channelId
// - transferDefinition
// - transferTimeout
// - nonceCreatedAt