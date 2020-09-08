// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "../Proxy.sol";

/*
abi = [
  'function adjudicatorTransfer(address[] to, uint256[] amount, address assetId)',
  'function depositA(uint256 amount, address assetId, bytes signature) payable',
  'function execTransaction(address to, uint256 value, bytes data, bytes[] signatures)'
]
*/

interface IChannelFactory {

    function calculateCreateProxyWithNonceAddress(
        address _mastercopy,
        bytes calldata initializer,
        uint256 saltNonce
    ) external returns (Proxy proxy);

    function createProxyWithNonce(
        address _mastercopy,
        bytes memory initializer,
        uint256 saltNonce
    ) external returns (Proxy proxy);

    function proxyCreationCode() external pure returns (bytes memory);

    function proxyRuntimeCode() external pure returns (bytes memory);

}

