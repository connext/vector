// Wrapper StableMath
pragma solidity ^0.7.0;

import "./lib/math/FixedPoint.sol";

import "./pools/stable/StablePoolUserDataHelpers.sol";
import "./pools/stable/StableMath.sol";

contract StableSwap is StableMath {

    using FixedPoint for uint256;
    using StablePoolUserDataHelpers for bytes;

    uint256 private immutable _amplificationParameter;
    
    constructor(uint256 amplificationParameter){
        _require(amplificationParameter >= _MIN_AMP, Errors.MIN_AMP);
        _require(amplificationParameter <= _MAX_AMP, Errors.MAX_AMP);

        _amplificationParameter = amplificationParameter;
    }

    function getAmplificationParameter() external view returns (uint256) {
        return _amplificationParameter;
    }

    // Swap

    function onSwapGivenIn(
        uint256 amount,
        uint256[] memory balances,
        uint256 indexIn,
        uint256 indexOut
    ) external view virtual returns (uint256) {
        uint256 amountOut = StableMath._calcOutGivenIn(
            _amplificationParameter,
            balances,
            indexIn,
            indexOut,
            amount
        );

        return amountOut;
    }

    function onSwapGivenOut(
        uint256 amount,
        uint256[] memory balances,
        uint256 indexIn,
        uint256 indexOut
    ) external view virtual returns (uint256) {
        uint256 amountIn = StableMath._calcInGivenOut(
            _amplificationParameter,
            balances,
            indexIn,
            indexOut,
            amount
        );

        return amountIn;
    }
}