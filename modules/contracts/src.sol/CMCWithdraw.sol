// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "./interfaces/ICMCWithdraw.sol";
import "./interfaces/IERC20.sol";
import "./lib/LibChannelCrypto.sol";
import "./CMCCore.sol";


contract CMCWithdraw is CMCCore, ICMCWithdraw {

    using LibChannelCrypto for bytes32;

    mapping(bytes32 => bool) isExecuted;

    /// @param recipient The address to which we're withdrawing funds to
    /// @param assetId The token address of the asset we're withdrawing (address(0)=eth)
    /// @param amount The number of units of asset we're withdrawing
    /// @param signatures A sorted bytes string of concatenated signatures of each owner
    function withdraw(
        address payable recipient,
        address assetId,
        uint256 amount,
        uint256 nonce,
        bytes[] memory signatures
    )
        public
        override
        onlyOnProxy
    {
        // Replay protection
        bytes32 withdrawHash = keccak256(
            abi.encodePacked(recipient, assetId, amount, nonce)
        );
        require(!isExecuted[withdrawHash], "Transacation has already been executed");
        isExecuted[withdrawHash] = true;

        // Validate signatures
        for (uint256 i = 0; i < participants.length; i++) {
            require(
                participants[i] == withdrawHash.verifyChannelMessage(signatures[i]),
                "CMCWithdraw: Invalid signature"
            );
        }

        // Add to totalWithdrawn
        _totalWithdrawn[assetId] += amount;

        // Execute the withdraw
        if (assetId == address(0)) {
            recipient.transfer(amount);
        } else {
            safeTransfer(assetId, recipient, amount);
        }
    }

    // uses uniswap transfer helper for non-confirming ERC20 tokens
    // https://github.com/Uniswap/uniswap-lib/blob/master/contracts/libraries/TransferHelper.sol
    function safeTransfer(address token, address to, uint value) internal {
        // bytes4(keccak256(bytes('transfer(address,uint256)')));
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(0xa9059cbb, to, value));
        require(success && (data.length == 0 || abi.decode(data, (bool))), 'CMCWithdraw: ERC20 transfer failed');
    }

}
