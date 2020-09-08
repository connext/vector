/*

Core channel state:
    Balance[][] balances; // TODO index by assetId? // initiator, responder
    uint256[] lockedValue; // Indexed by assetId -- should always be changed in lockstep with transfers
    address[] assetIds;
    bytes32 channelId;
    address[] participants; // Signer keys -- does NOT have to be the same as balances.to[]
    uint256 timeout;
    uint256 nonce;
    uint256 latestDepositNonce;
    bytes32 merkleRoot;

*/
