/*

Core channel state:
    Balance[][] balances; // TODO index by assetAddress? // initiator, responder
    uint256[] lockedBalance; // Indexed by assetAddress -- should always be changed in lockstep with transfers
    address[] assetAddresss;
    bytes32 channelId;
    address[] participants; // Signer keys -- does NOT have to be the same as balances.to[]
    uint256 timeout;
    uint256 nonce;
    uint256 latestDepositNonce;
    bytes32 merkleRoot;

*/
