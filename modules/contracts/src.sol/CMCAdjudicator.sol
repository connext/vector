// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCAdjudicator.sol";
import "./interfaces/ITransferDefinition.sol";
import "./CMCCore.sol";
import "./CMCAccountant.sol";
import "./lib/LibChannelCrypto.sol";
import "./lib/MerkleProof.sol";
import "./lib/SafeMath.sol";


/// @title CMCAdjudicator - Dispute logic for ONE channel
contract CMCAdjudicator is CMCCore, CMCAccountant, ICMCAdjudicator {

  using LibChannelCrypto for bytes32;
  using SafeMath for uint256;

  ChannelDispute private channelDispute;
  mapping(bytes32 => TransferDispute) private transferDisputes;

  modifier channelValid(CoreChannelState calldata ccs) {
    require(
      ccs.channelAddress == address(this) &&
      ccs.alice == alice &&
      ccs.bob == bob,
      "CMCCMCAdjudicator: Mismatch between given core channel state and channel we are at"
    );
    _;
  }

  modifier transferValid(CoreTransferState calldata cts) {
    require(
      cts.channelAddress == address(this),
      "CMCCMCAdjudicator: Mismatch between given core transfer state and channel we are at"
    );
    _;
  }

  function getChannelDispute() public override view returns (ChannelDispute memory) {
    return channelDispute;
  }

  function getTransferDispute(bytes32 transferId) public override view returns (TransferDispute memory) {
    return transferDisputes[transferId];
  }

  function disputeChannel(
    CoreChannelState calldata ccs,
    bytes calldata aliceSignature,
    bytes calldata bobSignature
  )
    external
    override
    channelValid(ccs)
  {
    verifySignatures(ccs, aliceSignature, bobSignature);
    require(!inDefundPhase(), "CMCAdjudicator disputeChannel: Not allowed in defund phase");
    require(channelDispute.nonce <= ccs.nonce, "CMCAdjudicator disputeChannel: New nonce smaller than stored one");
    if (inConsensusPhase()) {
      require(
        channelDispute.nonce < ccs.nonce,
        "CMCAdjudicator disputeChannel: Same nonce not allowed in consensus phase"
      );
      channelDispute.channelStateHash = hashChannelState(ccs);
      channelDispute.nonce = ccs.nonce;
      channelDispute.merkleRoot = ccs.merkleRoot;
    } else {
      // during regular operation
      // Only participants may start a dispute
      verifySenderIsParticipant(ccs);
      // For equality, skip updates without effect and only set new expiries
      if (channelDispute.nonce < ccs.nonce) {
        channelDispute.channelStateHash = hashChannelState(ccs);
        channelDispute.nonce = ccs.nonce;
        channelDispute.merkleRoot = ccs.merkleRoot;
      }
      // TODO: offchain-ensure that there can't be an overflow
      channelDispute.consensusExpiry = block.number.add(ccs.timeout);
      channelDispute.defundExpiry = block.number.add(ccs.timeout.mul(2));
    }
  }

  function defundChannel(
    CoreChannelState calldata ccs
  )
    external
    override
    channelValid(ccs)
  {
    verifySenderIsParticipant(ccs);
    require(inDefundPhase(), "CMCAdjudicator defundChannel: Not in defund phase");
    require(!channelDispute.isDefunded, "CMCAdjudicator defundChannel: channel already defunded");
    channelDispute.isDefunded = true;
    require(
      hashChannelState(ccs) == channelDispute.channelStateHash,
      "CMCAdjudicator defundChannel: Hash of core channel state does not match stored hash"
    );
    // TODO SECURITY: Beware of reentrancy
    // TODO: offchain-ensure that all arrays have the same length:
    // assetIds, balances, processedDepositsA, processedDepositsB
    for (uint256 i = 0; i < ccs.assetIds.length; i++) {
      address assetId = ccs.assetIds[i];
      Balance memory balance = ccs.balances[i];
      balance.amount[0] += totalDepositedA(assetId) - ccs.processedDepositsA[i];
      balance.amount[1] += totalDepositedB(assetId) - ccs.processedDepositsB[i];
      transferBalance(assetId, balance);
    }
  }

  function disputeTransfer(
    CoreTransferState calldata cts,
    bytes32[] calldata merkleProofData
  )
    external
    override
    transferValid(cts)
  {
    verifySenderIsInitiatorOrResponder(cts);
    require(inDefundPhase(), "CMCAdjudicator disputeTransfer: Not in defund phase");
    bytes32 transferStateHash = hashTransferState(cts);
    verifyMerkleProof(merkleProofData, channelDispute.merkleRoot, transferStateHash);
    TransferDispute storage transferDispute = transferDisputes[cts.transferId];
    require(transferDispute.transferDisputeExpiry == 0, "CMCAdjudicator disputeTransfer: transfer already disputed");
    transferDispute.transferStateHash = transferStateHash;
    // TODO: offchain-ensure that there can't be an overflow
    transferDispute.transferDisputeExpiry = block.number.add(cts.transferTimeout);
  }

  function defundTransfer(
    CoreTransferState calldata cts,
    bytes calldata encodedInitialTransferState,
    bytes calldata encodedTransferResolver
  )
    external
    override
    transferValid(cts)
  {
    TransferDispute storage transferDispute = transferDisputes[cts.transferId];
    require(
      hashTransferState(cts) == transferDispute.transferStateHash,
      "CMCAdjudicator defundTransfer: Hash of core transfer state does not match stored hash"
    );
    require(transferDispute.transferDisputeExpiry != 0, "CMCAdjudicator defundTransfer: transfer not yet disputed");
    require(!transferDispute.isDefunded, "CMCAdjudicator defundTransfer: transfer already defunded");
    transferDispute.isDefunded = true;
    Balance memory balance;
    if (block.number < transferDispute.transferDisputeExpiry) {
      verifySenderIsResponder(cts);
      require(
        keccak256(encodedInitialTransferState) == cts.initialStateHash,
        "CMCAdjudicator defundTransfer: Hash of encoded initial transfer state does not match stored hash"
      );
      ITransferDefinition transferDefinition = ITransferDefinition(cts.transferDefinition);
      balance = transferDefinition.resolve(encodedInitialTransferState, encodedTransferResolver);
    } else {
      balance = cts.initialBalance;
    }
    transferBalance(cts.assetId, balance);
  }

  function verifySenderIsParticipant(CoreChannelState calldata ccs) internal view {
    require(msg.sender == ccs.alice || msg.sender == ccs.bob, "CMCAdjudicator: msg.sender is not channel participant");
  }

  function verifySenderIsInitiatorOrResponder(CoreTransferState calldata cts) internal view {
    require(msg.sender == cts.initiator || msg.sender == cts.responder, "CMCAdjudicator: msg.sender is neither transfer initiator nor responder");
  }

  function verifySenderIsResponder(CoreTransferState calldata cts) internal view {
    require(msg.sender == cts.responder, "CMCAdjudicator: msg.sender is not transfer responder");
  }

  function verifySignatures(
    CoreChannelState calldata ccs,
    bytes calldata aliceSignature,
    bytes calldata bobSignature
  ) internal pure {
    bytes32 channelStateHash = hashChannelState(ccs);
    require(
      channelStateHash.checkSignature(aliceSignature, ccs.alice),
      "CMCAdjudicator: Invalid alice signature"
    );
    require(
      channelStateHash.checkSignature(bobSignature, ccs.bob),
      "CMCAdjudicator: Invalid bob signature"
    );
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
    return keccak256(abi.encode(ccs));
  }

  function hashTransferState(CoreTransferState calldata cts) internal pure returns (bytes32) {
    return keccak256(abi.encode(cts));
  }

}
