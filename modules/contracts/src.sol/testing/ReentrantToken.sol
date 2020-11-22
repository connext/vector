// SPDX-License-Identifier: MIT
pragma solidity ^0.7.1;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "../interfaces/IVectorChannel.sol";

contract ReentrantToken is ERC20 {
    address private immutable channel;

    constructor(address _channel) ERC20("Reentrant Token", "BADBOI") {
        channel = _channel;
    }

    function mint(address account, uint256 amount) external {
        _mint(account, amount);
    }

    // Designed to be called alongside CMCDeposit.depositAlice
    function transferFrom(
        address sender,
        address recipient,
        uint256 amount
    ) public override returns (bool) {
        IVectorChannel(channel).depositAlice(address(this), amount);
        return super.transferFrom(sender, recipient, amount);
    }
}
