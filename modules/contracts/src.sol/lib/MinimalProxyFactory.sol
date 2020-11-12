// SPDX-License-Identifier: MIT

pragma solidity ^0.7.0;

/// @title Channel Factory - Allows us to create new channel proxy contract
/// @author Nick Barry <https://github.com/ItsNickBarry>
/// @dev derived from https://github.com/optionality/clone-factory (MIT license)
abstract contract MinimalProxyFactory {
  bytes private constant _minimalProxyInitCodePrefix = hex'3d602d80600a3d3981f3_363d3d373d3d3d363d73';
  bytes private constant _minimalProxyInitCodeSuffix = hex'5af43d82803e903d91602b57fd5bf3';

  /**
  * @notice deploy contract code using "CREATE" opcode
   * @param initCode contract initialization code
   * @return deployment address of deployed contract
   */
  function _deploy (bytes memory initCode) internal returns (address deployment) {
    assembly {
      let encoded_data := add(0x20, initCode)
      let encoded_size := mload(initCode)
      deployment := create(0, encoded_data, encoded_size)
    }
  }

  /**
   * @notice deploy contract code using "CREATE2" opcode
   * @dev reverts if deployment is not successful (likely because salt has already been used)
   * @param initCode contract initialization code
   * @param salt input for deterministic address calculation
   * @return deployment address of deployed contract
   */
  function _deploy (bytes memory initCode, bytes32 salt) internal returns (address deployment) {
    assembly {
      let encoded_data := add(0x20, initCode)
      let encoded_size := mload(initCode)
      deployment := create2(0, encoded_data, encoded_size, salt)
    }

    require(deployment != address(0), 'MinimalProxyFactory: DEPLOYMENT_FAILED');
  }

  /**
   * @notice calculate the _deployMetamorphicContract deployment address for a given salt
   * @param initCodeHash hash of contract initialization code
   * @param salt input for deterministic address calculation
   * @return deployment address
   */
  function _calculateDeploymentAddress (bytes32 initCodeHash, bytes32 salt) internal view returns (address) {
    return address(uint(keccak256(abi.encodePacked(
      hex'ff',
      address(this),
      salt,
      initCodeHash
    ))));
  }

  /**
   * @notice deploy an EIP1167 minimal proxy using "CREATE" opcode
   * @param target implementation contract to proxy
   * @return minimalProxy address of deployed proxy
   */
  function _deployMinimalProxy (address target) internal returns (address minimalProxy) {
    return _deploy(_generateMinimalProxyInitCode(target));
  }

  /**
   * @notice deploy an EIP1167 minimal proxy using "CREATE2" opcode
   * @dev reverts if deployment is not successful (likely because salt has already been used)
   * @param target implementation contract to proxy
   * @param salt input for deterministic address calculation
   * @return minimalProxy address of deployed proxy
   */
  function _deployMinimalProxy (address target, bytes32 salt) internal returns (address minimalProxy) {
    return _deploy(_generateMinimalProxyInitCode(target), salt);
  }

  /**
   * @notice calculate the deployment address for a given target and salt
   * @param target implementation contract to proxy
   * @param salt input for deterministic address calculation
   * @return deployment address
   */
  function _calculateMinimalProxyDeploymentAddress (address target, bytes32 salt) internal view returns (address) {
    return _calculateDeploymentAddress(keccak256(_generateMinimalProxyInitCode(target)), salt);
  }

  /**
   * @notice concatenate elements to form EIP1167 minimal proxy initialization code
   * @param target implementation contract to proxy
   * @return bytes memory initialization code
   */
  function _generateMinimalProxyInitCode (address target) internal pure returns (bytes memory) {
    return abi.encodePacked(_minimalProxyInitCodePrefix, target, _minimalProxyInitCodeSuffix);
  }

}
