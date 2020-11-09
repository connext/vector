// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCWithdraw.sol";
import "./interfaces/Types.sol";
import "./interfaces/WithdrawHelper.sol";
import "./CMCCore.sol";
import "./AssetTransfer.sol";
import "./lib/LibAsset.sol";
import "./lib/LibChannelCrypto.sol";
import "./lib/LibUtils.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract CMCWithdraw is CMCCore, AssetTransfer, ICMCWithdraw {
  using LibChannelCrypto for bytes32;

  mapping(bytes32 => bool) private isExecuted;

  modifier validateWithdrawData(WithdrawData calldata wd) {
    require(
      wd.channelAddress == address(this),
      "CMCWithdraw: Channel address mismatch"
    );
    _;
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
  )
    external
    override
    onlyViaProxy
    nonReentrant
    validateWithdrawData(wd)
  {
    // Generate hash
    bytes32 wdHash = hashWithdrawData(wd);

    // Verify Alice's and Bob's signature on the withdraw data
    verifySignatures(wdHash, aliceSignature, bobSignature);

    // Replay protection
    require(!isExecuted[wdHash], "CMCWithdraw: Transaction has already been executed");
    isExecuted[wdHash] = true;

    // Determine actually transferable amount
    uint256 balance = LibAsset.getOwnBalance(wd.assetId);
    uint256 amount = LibUtils.min(wd.amount, balance);

    // Add to totalWithdrawn
    registerTransfer(wd.assetId, amount);

    // Execute the transfer
    require(LibAsset.transfer(wd.assetId, wd.recipient, amount), "CMCWithdraw: Transfer failed");

    // Do we have to make a call in addition to the actual transfer?
    if (wd.callTo != address(0)) {
      WithdrawHelper(wd.callTo).execute(wd, amount);
    }
  }

  function getWithdrawalTransactionRecord(
    WithdrawData calldata wd
  ) external override view onlyViaProxy nonReentrantView returns (bool) {
    return isExecuted[hashWithdrawData(wd)];
  }

  // TODO: include commitment type
  function verifySignatures(
    bytes32 wdHash,
    bytes calldata aliceSignature,
    bytes calldata bobSignature
  ) internal view {
    require(
      wdHash.checkSignature(aliceSignature, alice),
      "CMCWithdraw: Invalid alice signature"
    );
    require(
      wdHash.checkSignature(bobSignature, bob),
      "CMCWithdraw: Invalid bob signature"
    );
  }

  function hashWithdrawData(WithdrawData calldata wd) internal pure returns (bytes32) {
    return keccak256(abi.encode(wd));
  }

}
