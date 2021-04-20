// Wrapper StableMath

import "./lib/math/FixedPoint.sol";

import "./pools/stable/StablePoolUserDataHelpers.sol";
import "./pools/stable/StableMath.sol";

contact StableSwap is StableMath {

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

    function _onSwapGivenIn(
        SwapRequest memory swapRequest,
        uint256[] memory balances,
        uint256 indexIn,
        uint256 indexOut
    ) internal view virtual override whenNotPaused returns (uint256) {
        uint256 amountOut = StableMath._calcOutGivenIn(
            _amplificationParameter,
            balances,
            indexIn,
            indexOut,
            swapRequest.amount
        );

        return amountOut;
    }

    function _onSwapGivenOut(
        SwapRequest memory swapRequest,
        uint256[] memory balances,
        uint256 indexIn,
        uint256 indexOut
    ) internal view virtual override whenNotPaused returns (uint256) {
        uint256 amountIn = StableMath._calcInGivenOut(
            _amplificationParameter,
            balances,
            indexIn,
            indexOut,
            swapRequest.amount
        );

        return amountIn;
    }
}