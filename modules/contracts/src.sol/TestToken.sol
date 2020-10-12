// SPDX-License-Identifier: MIT

pragma solidity ^0.7.1;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";


/* This token is only useful for testing
 * Anybody can mint as many tokens as they like
 * Anybody can burn anyone else's tokens
 */
contract TestToken is ERC20 {

    // TODO: just hardcode name & symbol??
    constructor (string memory name, string memory symbol)
        ERC20(name, symbol)
        {}

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external {
        _burn(account, amount);
    }

}
