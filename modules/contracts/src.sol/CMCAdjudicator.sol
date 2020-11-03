// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCAdjudicator.sol";
import "./interfaces/ITransferDefinition.sol";
import "./CMCCore.sol";
import "./CMCAccountant.sol";
import "./lib/LibChannelCrypto.sol";
import "@openzeppelin/contracts/cryptography/MerkleProof.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/// @title CMCAdjudicator - Dispute logic for ONE channel
contract CMCAdjudicator is CMCCore, CMCAccountant, ICMCAdjudicator {
  using LibChannelCrypto for bytes32;
  using SafeMath for uint256;

  event ChannelDisputed(address disputer, address channelAddress, ChannelDispute dispute);

  event ChannelDefunded(address defunder, address channelAddress, ChannelDispute dispute);

  event TransferDisputed(address disputer, address channelAddress, bytes32 transferId, TransferDispute dispute);

  event TransferDefunded(
    address defunder,
    address channelAddress,
    TransferDispute dispute,
    bytes encodedInitialState,
    bytes encodedResolver,
    Balance balance
  );

  uint256 private constant QUERY_DEPOSITS_GAS_LIMIT = 12000;

  ChannelDispute private channelDispute;
  mapping(bytes32 => TransferDispute) private transferDisputes;

  modifier validateChannel(CoreChannelState calldata ccs) {
    require(
      ccs.channelAddress == address(this) && ccs.alice == alice && ccs.bob == bob,
      "CMCAdjudicator: Mismatch between given core channel state and channel we are at"
    );
    _;
  }

  modifier validateTransfer(CoreTransferState calldata cts) {
    require(
      cts.channelAddress == address(this),
      "CMCAdjudicator: Mismatch between given core transfer state and channel we are at"
    );
    _;
  }

  function getChannelDispute() external override view onlyViaProxy nonReentrantView returns (ChannelDispute memory) {
    return channelDispute;
  }

  function getTransferDispute(bytes32 transferId)
    external
    override
    view
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
    // Verify Alice's and Bob's signature on the channel state
    verifySignatures(ccs, aliceSignature, bobSignature);

    // We cannot dispute a channel in its defund phase
    require(!inDefundPhase(), "CMCAdjudicator disputeChannel: Not allowed in defund phase");

    // New nonce must be strictly greater than the stored one
    require(channelDispute.nonce < ccs.nonce, "CMCAdjudicator disputeChannel: New nonce smaller than stored one");

    if (!inConsensusPhase()) {
      // We are not already in a dispute
      // Set expiries
      // TODO: offchain-ensure that there can't be an overflow
      channelDispute.consensusExpiry = block.number.add(ccs.timeout);
      channelDispute.defundExpiry = block.number.add(ccs.timeout.mul(2));
    }

    // Store newer state
    channelDispute.channelStateHash = hashChannelState(ccs);
    channelDispute.nonce = ccs.nonce;
    channelDispute.merkleRoot = ccs.merkleRoot;

    // Emit event
    emit ChannelDisputed(msg.sender, address(this), channelDispute);
  }

  function defundChannel(CoreChannelState calldata ccs)
    external
    override
    onlyViaProxy
    nonReentrant
    validateChannel(ccs)
  {
    // Verify that the given channel state matches the stored one
    require(
      hashChannelState(ccs) == channelDispute.channelStateHash,
      "CMCAdjudicator defundChannel: Hash of core channel state does not match stored hash"
    );

    // We need to be in defund phase for that
    require(inDefundPhase(), "CMCAdjudicator defundChannel: Not in defund phase");

    // We can't defund twice at the same defund nonce
    // TODO: should this be checked in the `disputeChannel`?
    require(channelDispute.defundNonce < ccs.defundNonce, "CMCAdjudicator defundChannel: channel already defunded");
    channelDispute.defundNonce = ccs.defundNonce;

    // TODO SECURITY: Beware of reentrancy
    // TODO: offchain-ensure that all arrays have the same length:
    // assetIds, balances, processedDepositsA, processedDepositsB
    // Make sure there are no duplicates in the assetIds -- duplicates are often a source of double-spends

    // Defund all assets stored in the channel
    for (uint256 i = 0; i < ccs.assetIds.length; i++) {
      address assetId = ccs.assetIds[i];
      Balance memory balance = ccs.balances[i];

      // Add unprocessed deposits to amounts
      balance.amount[0] += _getTotalDepositsAlice(assetId) - ccs.processedDepositsA[i];

      // If the following call fails, we were unable to query the channel's balance;
      // this probably means the token is totally fucked up.
      // Since we mustn't revert here (in order to prevent other assets from becoming frozen),
      // we proceed anyway and assume there are no unprocessed deposits for Bob.
      (bool success, bytes memory encodedReturnValue) = address(this).call{gas: QUERY_DEPOSITS_GAS_LIMIT}(
        abi.encodeWithSignature("_depositsBob(address)", assetId)
      );
      if (success) {
        uint256 depositsBob = abi.decode(encodedReturnValue, (uint256));
        balance.amount[1] += depositsBob - ccs.processedDepositsB[i];
      }

      // Transfer funds; this will never revert or fail otherwise,
      // i.e. if the underlying "real" asset transfer fails,
      // the funds are made available for emergency withdrawal
      transferBalance(assetId, balance);
    }

    emit ChannelDefunded(msg.sender, address(this), channelDispute);
  }

  function disputeTransfer(CoreTransferState calldata cts, bytes32[] calldata merkleProofData)
    external
    override
    onlyViaProxy
    nonReentrant
    validateTransfer(cts)
  {
    // Verify that the given transfer state is included in the "finalized" channel state
    bytes32 transferStateHash = hashTransferState(cts);
    verifyMerkleProof(merkleProofData, channelDispute.merkleRoot, transferStateHash);

    // The channel needs to be in defund phase for that, i.e. channel state is "finalized"
    require(inDefundPhase(), "CMCAdjudicator disputeTransfer: Not in defund phase");

    // Get stored dispute for this transfer
    TransferDispute storage transferDispute = transferDisputes[cts.transferId];

    // Verify that this transfer has not been disputed before
    require(transferDispute.transferDisputeExpiry == 0, "CMCAdjudicator disputeTransfer: transfer already disputed");

    // Store transfer state and set expiry
    transferDispute.transferStateHash = transferStateHash;
    // TODO: offchain-ensure that there can't be an overflow
    transferDispute.transferDisputeExpiry = block.number.add(cts.transferTimeout);

    emit TransferDisputed(msg.sender, address(this), cts.transferId, transferDispute);
  }

  function defundTransfer(
    CoreTransferState calldata cts,
    bytes calldata encodedInitialTransferState,
    bytes calldata encodedTransferResolver
  ) external override onlyViaProxy nonReentrant validateTransfer(cts) {
    // Get stored dispute for this transfer
    TransferDispute storage transferDispute = transferDisputes[cts.transferId];

    // Verify that the given transfer state matches the stored one
    require(
      hashTransferState(cts) == transferDispute.transferStateHash,
      "CMCAdjudicator defundTransfer: Hash of core transfer state does not match stored hash"
    );

    // Verify that a dispute for this transfer has already been started
    // NOTE: there is no way to get to here without also failing previous
    // require
    require(transferDispute.transferDisputeExpiry != 0, "CMCAdjudicator defundTransfer: transfer not yet disputed");

    // We can't defund twice
    require(!transferDispute.isDefunded, "CMCAdjudicator defundTransfer: transfer already defunded");
    transferDispute.isDefunded = true;

    Balance memory balance;

    if (block.number < transferDispute.transferDisputeExpiry) {
      // Before dispute expiry, responder can resolve
      require(msg.sender == cts.responder, "CMCAdjudicator: msg.sender is not transfer responder");
      require(
        keccak256(encodedInitialTransferState) == cts.initialStateHash,
        "CMCAdjudicator defundTransfer: Hash of encoded initial transfer state does not match stored hash"
      );
      ITransferDefinition transferDefinition = ITransferDefinition(cts.transferDefinition);
      balance = transferDefinition.resolve(
        abi.encode(cts.balance),
        encodedInitialTransferState,
        encodedTransferResolver
      );
      // Verify that returned balances don't exceed initial balances
      require(
        balance.amount[0].add(balance.amount[1]) <= cts.balance.amount[0].add(cts.balance.amount[1]),
        "CMCAdjudicator defundTransfer: resolved balances exceed initial balances"
      );
    } else {
      // After dispute expiry, if the responder hasn't resolved, we defund the initial balance
      balance = cts.balance;
    }

    // Depending on previous code path, defund either resolved or initial balance
    // This will never revert or fail otherwise,
    // i.e. if the underlying "real" asset transfer fails,
    // the funds are made available for emergency withdrawal
    transferBalance(cts.assetId, balance);

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

  function _depositsBob(address assetId) external onlySelf returns (uint256) {
    return _getTotalDepositsBob(assetId);
  }

  function verifySignatures(
    CoreChannelState calldata ccs,
    bytes calldata aliceSignature,
    bytes calldata bobSignature
  ) internal pure {
    bytes32 ccsHash = hashChannelState(ccs);
    require(ccsHash.checkSignature(aliceSignature, ccs.alice), "CMCAdjudicator: Invalid alice signature");
    require(ccsHash.checkSignature(bobSignature, ccs.bob), "CMCAdjudicator: Invalid bob signature");
  }

  function verifyMerkleProof(
    bytes32[] calldata proof,
    bytes32 root,
    bytes32 leaf
  ) internal pure {
    require(MerkleProof.verify(proof, root, leaf), "CMCAdjudicator: Merkle proof verification failed");
  }

  function inConsensusPhase() internal view returns (bool) {
    return block.number < channelDispute.consensusExpiry;
  }

  function inDefundPhase() internal view returns (bool) {
    return channelDispute.consensusExpiry <= block.number && block.number < channelDispute.defundExpiry;
  }

  function hashChannelState(CoreChannelState calldata ccs) internal pure returns (bytes32) {
    // TODO: include commitment type
    return keccak256(abi.encode(ccs));
  }

  function hashTransferState(CoreTransferState calldata cts) internal pure returns (bytes32) {
    return keccak256(abi.encode(cts));
  }
}
