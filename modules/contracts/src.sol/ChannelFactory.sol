// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.7.1;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/utils/Create2.sol";

import "./interfaces/IChannelFactory.sol";
import "./interfaces/IVectorChannel.sol";
import "./lib/LibAsset.sol";
import "./lib/LibERC20.sol";

/// @title Channel Factory - Allows us to create new channel proxy contract
/// @author Connext & Friends <hello@connext.network>
contract ChannelFactory is IChannelFactory {
  bytes private constant proxyCreationCodePrefix = hex"3d602d80600a3d3981f3_363d3d373d3d3d363d73";
  bytes private constant proxyCreationCodeSuffix = hex"5af43d82803e903d91602b57fd5bf3";

  address private immutable mastercopy;
  uint256 private immutable chainId;

  constructor(address _mastercopy, uint256 _chainId) {
    mastercopy = _mastercopy;
    chainId = _chainId;
  }

  ////////////////////////////////////////
  // Public Methods

  /// @dev Allows us to get the mastercopy that this factory will deploy channels against
  function getMastercopy() external view override returns (address) {
    return mastercopy;
  }

  /// @dev Allows us to get the chainId that this factory will use in the create2 salt
  function getChainId() public view override returns (uint256 _chainId) {
    if (chainId == 0) {
      assembly {
        _chainId := chainid()
      }
    } else {
      _chainId = chainId;
    }
  }

  /// @dev Allows us to get the chainId that this factory has stored
  function getStoredChainId() external view override returns (uint256) {
    return chainId;
  }

  function getProxyCreationCode() public view override returns (bytes memory) {
    return abi.encodePacked(proxyCreationCodePrefix, mastercopy, proxyCreationCodeSuffix);
  }

  /// @dev Allows us to get the address for a new channel contract created via `createChannel`
  /// @param alice address of one of the two participants in the channel
  /// @param bob address of the other channel participant
  function getChannelAddress(address alice, address bob) external view override returns (address) {
    return Create2.computeAddress(generateSalt(alice, bob), keccak256(getProxyCreationCode()));
  }

  /// @dev Allows us to create new channel contract and get it all set up in one transaction
  /// @param alice address of one of the channel participants
  /// @param bob address of the other channel participant
  function createChannel(address alice, address bob) public override returns (address channel) {
    channel = deployChannelProxy(alice, bob);
    IVectorChannel(channel).setup(alice, bob);
    emit ChannelCreation(channel);
  }

  /// @dev Allows us to create a new channel contract and fund it in one transaction
  /// @param bob address of the other channel participant
  function createChannelAndDepositAlice(
    address alice,
    address bob,
    address assetId,
    uint256 amount
  ) external payable override returns (address channel) {
    channel = createChannel(alice, bob);
    // TODO: This is a bit ugly and inefficient, but alternative solutions are too.
    // Do we want to keep it this way?
    if (!LibAsset.isEther(assetId)) {
      require(
        LibERC20.transferFrom(assetId, msg.sender, address(this), amount),
        "ChannelFactory: ERC20_TRANSFER_FAILED"
      );
      require(LibERC20.approve(assetId, address(channel), amount), "ChannelFactory: ERC20_APPROVE_FAILED");
    }
    IVectorChannel(channel).depositAlice{value: msg.value}(assetId, amount);
  }

  ////////////////////////////////////////
  // Internal Methods

  /// @dev Allows us to create new channel contact using CREATE2
  /// @dev This method is only meant as an utility to be called from other methods
  /// @param alice address of one of the two participants in the channel
  /// @param bob address of the other channel participant
  function deployChannelProxy(address alice, address bob) internal returns (address) {
    bytes32 salt = generateSalt(alice, bob);
    return Create2.deploy(0, salt, getProxyCreationCode());
  }

  function generateSalt(address alice, address bob) internal view returns (bytes32) {
    return keccak256(abi.encodePacked(alice, bob, getChainId()));
  }
}
