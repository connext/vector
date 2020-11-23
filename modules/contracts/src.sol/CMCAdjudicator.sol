// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/Commitment.sol";
import "./interfaces/ICMCAdjudicator.sol";
import "./interfaces/ITransferDefinition.sol";
import "./interfaces/Types.sol";
import "./CMCCore.sol";
import "./CMCAsset.sol";
import "./CMCDeposit.sol";
import "./lib/LibChannelCrypto.sol";
import "./lib/LibMath.sol";
import "@openzeppelin/contracts/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @title CMCAdjudicator - Dispute logic for ONE channel
contract CMCAdjudicator is CMCCore, CMCAsset, CMCDeposit, ICMCAdjudicator {
    using LibChannelCrypto for bytes32;
    using LibMath for uint256;
    using SafeMath for uint256;

    uint256 private constant INITIAL_DEFUND_NONCE = 1;

    ChannelDispute private channelDispute;
    mapping(address => uint256) private defundNonces;
    mapping(bytes32 => TransferDispute) private transferDisputes;

    modifier validateChannel(CoreChannelState calldata ccs) {
        require(
            ccs.channelAddress == address(this) &&
                ccs.alice == alice &&
                ccs.bob == bob,
            "CMCAdjudicator: INVALID_CHANNEL"
        );
        _;
    }

    modifier validateTransfer(CoreTransferState calldata cts) {
        require(
            cts.channelAddress == address(this),
            "CMCAdjudicator: INVALID_TRANSFER"
        );
        _;
    }

    function getChannelDispute()
        external
        view
        override
        onlyViaProxy
        nonReentrantView
        returns (ChannelDispute memory)
    {
        return channelDispute;
    }

    function getDefundNonce(address assetId)
        external
        view
        override
        onlyViaProxy
        nonReentrantView
        returns (uint256)
    {
        return defundNonces[assetId];
    }

    function getTransferDispute(bytes32 transferId)
        external
        view
        override
        onlyViaProxy
        nonReentrantView
        returns (TransferDispute memory)
    {
        return transferDisputes[transferId];
    }

    function disputeChannel(
        CoreChannelState calldata ccs,
        bytes calldata aliceSignature,
        bytes calldata bobSignature
    ) external override onlyViaProxy nonReentrant validateChannel(ccs) {
        // Generate hash
        bytes32 ccsHash = hashChannelState(ccs);

        // Verify Alice's and Bob's signature on the channel state
        verifySignaturesOnChannelStateHash(ccs, ccsHash, aliceSignature, bobSignature);

        // We cannot dispute a channel in its defund phase
        require(!inDefundPhase(), "CMCAdjudicator: INVALID_PHASE");

        // New nonce must be strictly greater than the stored one
        require(
            channelDispute.nonce < ccs.nonce,
            "CMCAdjudicator: INVALID_NONCE"
        );

        if (!inConsensusPhase()) {
            // We are not already in a dispute
            // Set expiries
            // TODO: offchain-ensure that there can't be an overflow
            channelDispute.consensusExpiry = block.timestamp.add(ccs.timeout);
            channelDispute.defundExpiry = block.timestamp.add(
                ccs.timeout.mul(2)
            );
        }

        // Store newer state
        channelDispute.channelStateHash = ccsHash;
        channelDispute.nonce = ccs.nonce;
        channelDispute.merkleRoot = ccs.merkleRoot;

        // Emit event
        emit ChannelDisputed(msg.sender, address(this), channelDispute);
    }

    function defundChannel(
        CoreChannelState calldata ccs,
        address[] calldata assetIds,
        uint256[] calldata indices
    ) external override onlyViaProxy nonReentrant validateChannel(ccs) {
        // These checks are not strictly necessary, but it's a bit cleaner this way
        require(assetIds.length > 0, "CMCAdjudicator: NO_ASSETS_GIVEN");
        require(
            indices.length <= assetIds.length,
            "CMCAdjudicator: WRONG_ARRAY_LENGTHS"
        );

        // Verify that the given channel state matches the stored one
        require(
            hashChannelState(ccs) == channelDispute.channelStateHash,
            "CMCAdjudicator: INVALID_CHANNEL_HASH"
        );

        // We need to be in defund phase for that
        require(inDefundPhase(), "CMCAdjudicator: INVALID_PHASE");

        // TODO SECURITY: Beware of reentrancy
        // TODO: offchain-ensure that all arrays have the same length:
        // assetIds, balances, processedDepositsA, processedDepositsB, defundNonces
        // Make sure there are no duplicates in the assetIds -- duplicates are often a source of double-spends

        // Defund all assets given
        for (uint256 i = 0; i < assetIds.length; i++) {
            address assetId = assetIds[i];

            // Verify or find the index of the assetId in the ccs.assetIds
            uint256 index;
            if (i < indices.length) {
                // The index was supposedly given -- we verify
                index = indices[i];
                require(
                    assetId == ccs.assetIds[index],
                    "CMCAdjudicator: INDEX_MISMATCH"
                );
            } else {
                // we search through the assets in ccs
                for (index = 0; index < ccs.assetIds.length; index++) {
                    if (assetId == ccs.assetIds[index]) {
                        break;
                    }
                }
            }

            // Now, if `index`  is equal to the number of assets in ccs,
            // then the current asset is not in ccs;
            // otherwise, `index` is the index in ccs for the current asset

            // Check the assets haven't already been defunded + update the
            // defundNonce for that asset
            {
                // Open a new block to avoid "stack too deep" error
                uint256 defundNonce =
                    (index == ccs.assetIds.length)
                        ? INITIAL_DEFUND_NONCE
                        : ccs.defundNonces[index];
                require(
                    defundNonces[assetId] < defundNonce,
                    "CMCAdjudicator: CHANNEL_ALREADY_DEFUNDED"
                );
                defundNonces[assetId] = defundNonce;
            }

            // Get total deposits
            uint256 tdAlice = _getTotalDepositsAlice(assetId);
            uint256 tdBob = _getTotalDepositsBob(assetId);

            Balance memory balance;

            if (index == ccs.assetIds.length) {
                // The current asset is not a part of ccs; refund what has been deposited
                balance = Balance({
                    amount: [tdAlice, tdBob],
                    to: [payable(ccs.alice), payable(ccs.bob)]
                });
            } else {
                // Start with the final balances in ccs
                balance = ccs.balances[index];
                // Add unprocessed deposits
                balance.amount[0] = balance.amount[0].satAdd(
                    tdAlice - ccs.processedDepositsA[index]
                );
                balance.amount[1] = balance.amount[1].satAdd(
                    tdBob - ccs.processedDepositsB[index]
                );
            }

            // Add result to emergency-withdrawable amounts
            makeBalanceEmergencyWithdrawable(assetId, balance);
        }

        emit ChannelDefunded(
            msg.sender,
            address(this),
            channelDispute,
            assetIds,
            indices
        );
    }

    function disputeTransfer(
        CoreTransferState calldata cts,
        bytes32[] calldata merkleProofData
    ) external override onlyViaProxy nonReentrant validateTransfer(cts) {
        // Verify that the given transfer state is included in the "finalized" channel state
        bytes32 transferStateHash = hashTransferState(cts);
        verifyMerkleProof(
            merkleProofData,
            channelDispute.merkleRoot,
            transferStateHash
        );

        // The channel needs to be in defund phase for that, i.e. channel state is "finalized"
        require(inDefundPhase(), "CMCAdjudicator: INVALID_PHASE");

        // Get stored dispute for this transfer
        TransferDispute storage transferDispute =
            transferDisputes[cts.transferId];

        // Verify that this transfer has not been disputed before
        require(
            transferDispute.transferDisputeExpiry == 0,
            "CMCAdjudicator: TRANSFER_ALREADY_DISPUTED"
        );

        // Store transfer state and set expiry
        transferDispute.transferStateHash = transferStateHash;
        // TODO: offchain-ensure that there can't be an overflow
        transferDispute.transferDisputeExpiry = block.timestamp.add(
            cts.transferTimeout
        );

        emit TransferDisputed(
            msg.sender,
            address(this),
            cts.transferId,
            transferDispute
        );
    }

    function defundTransfer(
        CoreTransferState calldata cts,
        bytes calldata encodedInitialTransferState,
        bytes calldata encodedTransferResolver
    ) external override onlyViaProxy nonReentrant validateTransfer(cts) {
        // Get stored dispute for this transfer
        TransferDispute storage transferDispute =
            transferDisputes[cts.transferId];

        // Verify that a dispute for this transfer has already been started
        require(
            transferDispute.transferDisputeExpiry != 0,
            "CMCAdjudicator: TRANSFER_NOT_DISPUTED"
        );

        // Verify that the given transfer state matches the stored one
        require(
            hashTransferState(cts) == transferDispute.transferStateHash,
            "CMCAdjudicator: INVALID_TRANSFER_HASH"
        );

        // We can't defund twice
        require(
            !transferDispute.isDefunded,
            "CMCAdjudicator: TRANSFER_ALREADY_DEFUNDED"
        );
        transferDispute.isDefunded = true;

        Balance memory balance;

        if (block.timestamp < transferDispute.transferDisputeExpiry) {
            // Before dispute expiry, responder can resolve
            require(
                msg.sender == cts.responder,
                "CMCAdjudicator: INVALID_MSG_SENDER"
            );
            require(
                keccak256(encodedInitialTransferState) == cts.initialStateHash,
                "CMCAdjudicator: INVALID_TRANSFER_HASH"
            );
            ITransferDefinition transferDefinition =
                ITransferDefinition(cts.transferDefinition);
            balance = transferDefinition.resolve(
                abi.encode(cts.balance),
                encodedInitialTransferState,
                encodedTransferResolver
            );
            // Verify that returned balances don't exceed initial balances
            require(
                balance.amount[0].add(balance.amount[1]) <=
                    cts.balance.amount[0].add(cts.balance.amount[1]),
                "CMCAdjudicator: INVALID_BALANCES"
            );
        } else {
            // After dispute expiry, if the responder hasn't resolved, we defund the initial balance
            balance = cts.balance;
        }

        // Depending on previous code path, defund either resolved or initial balance
        makeBalanceEmergencyWithdrawable(cts.assetId, balance);

        // Emit event
        emit TransferDefunded(
            msg.sender,
            address(this),
            transferDispute,
            encodedInitialTransferState,
            encodedTransferResolver,
            balance
        );
    }

    function verifySignaturesOnChannelStateHash(
        CoreChannelState calldata ccs,
        bytes32 ccsHash,
        bytes calldata aliceSignature,
        bytes calldata bobSignature
    ) internal pure {
        bytes32 commitment =
            keccak256(abi.encode(CommitmentType.ChannelState, ccsHash));
        require(
            commitment.checkSignature(aliceSignature, ccs.alice),
            "CMCAdjudicator: INVALID_ALICE_SIG"
        );
        require(
            commitment.checkSignature(bobSignature, ccs.bob),
            "CMCAdjudicator: INVALID_BOB_SIG"
        );
    }

    function verifyMerkleProof(
        bytes32[] calldata proof,
        bytes32 root,
        bytes32 leaf
    ) internal pure {
        require(
            MerkleProof.verify(proof, root, leaf),
            "CMCAdjudicator: INVALID_MERKLE_PROOF"
        );
    }

    function inConsensusPhase() internal view returns (bool) {
        return block.timestamp < channelDispute.consensusExpiry;
    }

    function inDefundPhase() internal view returns (bool) {
        return
            channelDispute.consensusExpiry <= block.timestamp &&
            block.timestamp < channelDispute.defundExpiry;
    }

    function hashChannelState(CoreChannelState calldata ccs)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(ccs));
    }

    function hashTransferState(CoreTransferState calldata cts)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encode(cts));
    }
}
