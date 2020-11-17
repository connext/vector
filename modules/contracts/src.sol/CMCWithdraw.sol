// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/Commitment.sol";
import "./interfaces/ICMCWithdraw.sol";
import "./interfaces/WithdrawHelper.sol";
import "./CMCCore.sol";
import "./AssetTransfer.sol";
import "./lib/LibAsset.sol";
import "./lib/LibChannelCrypto.sol";
import "./lib/LibUtils.sol";

contract CMCWithdraw is CMCCore, AssetTransfer, ICMCWithdraw {
  using LibChannelCrypto for bytes32;

  mapping(bytes32 => bool) private isExecuted;

  modifier validateWithdrawData(WithdrawData calldata wd) {
    require(wd.channelAddress == address(this), "CMCWithdraw: CHANNEL_MISMATCH");
    _;
  }

  function getWithdrawalTransactionRecord(WithdrawData calldata wd) external override view onlyViaProxy returns (bool) {
    return isExecuted[hashWithdrawData(wd)];
  }

  /// @param wd The withdraw data consisting of
  /// semantic withdraw information, i.e. assetId, recipient, and amount;
  /// information to make an optional call in addition to the actual transfer,
  /// i.e. target address for the call and call payload;
  /// additional information, i.e. channel address and nonce.
  /// @param aliceSignature Signature of owner a
  /// @param bobSignature Signature of owner b
  function withdraw(
    WithdrawData calldata wd,
    bytes calldata aliceSignature,
    bytes calldata bobSignature
  ) external override onlyViaProxy validateWithdrawData(wd) {
    // Generate hash
    bytes32 wdHash = hashWithdrawData(wd);

    // Verify Alice's and Bob's signature on the withdraw data
    verifySignatures(wdHash, aliceSignature, bobSignature);

    // Replay protection
    require(!isExecuted[wdHash], "CMCWithdraw: ALREADY_EXECUTED");
    isExecuted[wdHash] = true;

    // Determine actually transferable amount
    uint256 balance = LibAsset.getOwnBalance(wd.assetId);
    uint256 amount = LibUtils.min(wd.amount, balance);

    // Revert if amount is zero && callTo is 0
    require(amount > 0 || wd.callTo != address(0), "CMCWithdraw: NO_OP");

    // Add to totalWithdrawn
    registerTransfer(wd.assetId, amount);

    // Execute the transfer
    require(LibAsset.transfer(wd.assetId, wd.recipient, amount), "CMCWithdraw: ASSET_TRANSFER_FAILED");

    // Do we have to make a call in addition to the actual transfer?
    if (wd.callTo != address(0)) {
      WithdrawHelper(wd.callTo).execute(wd, amount);
    }
  }

  function verifySignatures(
    bytes32 wdHash,
    bytes calldata aliceSignature,
    bytes calldata bobSignature
  ) internal view {
    bytes32 commitment = keccak256(abi.encode(CommitmentType.WithdrawData, wdHash));
    require(commitment.checkSignature(aliceSignature, alice), "CMCWithdraw: INVALID_ALICE_SIG");
    require(commitment.checkSignature(bobSignature, bob), "CMCWithdraw: INVALID_BOB_SIG");
  }

  function hashWithdrawData(WithdrawData calldata wd) internal pure returns (bytes32) {
    return keccak256(abi.encode(wd));
  }
}
