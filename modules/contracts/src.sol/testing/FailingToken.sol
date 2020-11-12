// SPDX-License-Identifier: MIT

pragma solidity ^0.7.1;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


/* This token is ONLY useful for testing
 * Anybody can mint as many tokens as they like
 * Anybody can burn anyone else's tokens
 * Will fail to transfer ANY tokens
 */
contract FailingToken is ERC20 {

  bool public transferShouldRevert;
  bool public transferShouldFail;
  bool public rejectEther;

    constructor () ERC20("Failing Token", "FAIL") {
      transferShouldRevert = true;
      _mint(msg.sender, 1000000 ether);
    }

    receive() external payable {
        if (rejectEther) {
          revert("Ether rejected");
        }
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external {
        _burn(account, amount);
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
      if (transferShouldRevert) {
        revert("FAIL: Failing token");
      }
      if (transferShouldFail) {
        return false;
      }
      return super.transfer(recipient, amount);
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
      if (transferShouldRevert) {
        revert("FAIL: Failing token");
      }
      if (transferShouldFail) {
        return false;
      }
      return super.transferFrom(sender, recipient, amount);
    }

    function setTransferShouldRevert(bool _transferShouldRevert) public returns (bool) {
      transferShouldRevert = _transferShouldRevert;
      return transferShouldRevert;
    }

    function setTransferShouldFail(bool _transferShouldFail) public returns (bool) {
      transferShouldFail = _transferShouldFail;
      return transferShouldFail;
    }

    function setRejectEther(bool _rejectEther) public returns (bool) {
      rejectEther = _rejectEther;
      return rejectEther;
    }

    function succeedingTransfer(address recipient, uint256 amount) public returns (bool) {
      return super.transfer(recipient, amount);
    }

}
