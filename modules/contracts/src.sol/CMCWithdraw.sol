// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCWithdraw.sol";
import "./interfaces/Types.sol";
import "./CMCCore.sol";
import "./AssetTransfer.sol";
import "./lib/LibAsset.sol";
import "./lib/LibChannelCrypto.sol";
import "@openzeppelin/contracts/utils/Address.sol";


contract CMCWithdraw is CMCCore, AssetTransfer, ICMCWithdraw {
  using LibChannelCrypto for bytes32;

  mapping(bytes32 => bool) private isExecuted;

  modifier validateWithdrawData(WithdrawData calldata wd) {
    require(
      wd.channelAddress == address(this),
      "CMCWithdraw: Mismatch between withdraw data and channel"
    );
    _;
  }

  /// @param wd The withdraw data consisting of
  /// "semantic information", i.e. assetId, recipient, and amount;
  /// "execution information", i.e. address to make the call to, value, and data for the call; and
  /// "additional information", i.e. channel address and nonce.
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

    // Add to totalWithdrawn
    registerTransfer(wd.assetId, wd.amount);

    // Unless this is a plain Ether transfer, verify that the target address has code
    if (wd.callData.length > 0) {
      require(Address.isContract(wd.callTo), "CMCWithdraw: Called address has no code");
    }

    // Execute the withdraw
    (bool success, bytes memory encodedReturnValue) = wd.callTo.call{value: wd.callValue}(wd.callData);

    // Check success:
    // For plain Ether transfers (i.e. empty data), we just check whether the call was successful;
    // for non-empty data, in addition to a successful call, we require that the called address
    // has code (already done above) and we accept empty return data or the Boolean value `true`.
    // This is compatible with the ERC20 standard, as well as with tokens that exhibit the
    // missing-return-value bug. Custom contracts as call targets must follow this convention.
    require(success, "CMCWithdraw: Call reverted");
    if (wd.callData.length > 0) {
      require(encodedReturnValue.length == 0 || abi.decode(encodedReturnValue, (bool)), "CMCWithdraw: Call failed");
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
