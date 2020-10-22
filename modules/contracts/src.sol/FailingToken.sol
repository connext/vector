    
    
// SPDX-License-Identifier: MIT

pragma solidity ^0.7.1;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


/* This token is ONLY useful for testing
 * Anybody can mint as many tokens as they like
 * Anybody can burn anyone else's tokens
 * Will fail to transfer ANY tokens
 */
contract FailingToken is ERC20 {

    constructor () ERC20("Failing Token", "FAIL") {
      _mint(msg.sender, 1000000 ether);
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external {
        _burn(account, amount);
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
      require(false, "Failing token never transfers");
    }

    function succeedingTransfer(address recipient, uint256 amount) public returns (bool) {
      return super.transfer(recipient, amount);
    }

}
