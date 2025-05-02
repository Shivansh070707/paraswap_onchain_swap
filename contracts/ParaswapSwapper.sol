// SPDX-License-Identifier: MIT
pragma solidity 0.8.29;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "hardhat/console.sol";

/**
 * @title ParaswapSwapper
 * @dev Contract to execute token swaps through a pure multicall pattern
 */
contract ParaswapSwapper is Ownable {
    using SafeERC20 for IERC20;

    // Events
    event SwapExecuted(
        address indexed srcToken,
        address indexed destToken,
        uint256 srcAmount,
        uint256 destAmount,
        address indexed user
    );
    
    event MultiCallExecuted(
        address caller,
        uint256 callCount,
        bool allSuccess
    );

    /**
     * @dev Constructor
     */
    constructor() Ownable(msg.sender) {}

    /**
     * @dev Structure to represent a call that will be executed in multicall
     */
    struct Call {
        address target;
        bytes callData;
        bool allowFailure;
    }

    /**
     * @dev Structure to represent the return data and success state of a call
     */
    struct Result {
        bool success;
        bytes returnData;
    }

    /**
     * @dev Execute multiple calls in a single transaction
     * @param calls Array of calls to execute
     * @return results Array of results from the calls
     */
    function multicall(Call[] calldata calls) public returns (Result[] memory results) {
        results = new Result[](calls.length);
        bool allSuccess = true;
        
        for (uint256 i = 0; i < calls.length; i++) {
            (bool success, bytes memory returnData) = calls[i].target.call(calls[i].callData);
            
            if (!success && !calls[i].allowFailure) {
                allSuccess = false;
            }
            
            results[i] = Result(success, returnData);
            
            // For debugging
            if (success) {
                console.log("Call %d to %s succeeded", i, calls[i].target);
            } else {
                console.log("Call %d to %s failed", i, calls[i].target);
            }
        }
        
        emit MultiCallExecuted(msg.sender, calls.length, allSuccess);
        return results;
    }

    /**
     * @dev Execute a token swap using multicall pattern
     * @param srcToken Source token address
     * @param destToken Destination token address
     * @param srcAmount Amount of source token to swap
     * @param minDestAmount Minimum amount of destination token to receive
     * @param calls Array of calls to execute as part of the swap
     * @return destAmount Destination token amount received
     */
    function executeSwap(
        address srcToken,
        address destToken,
        uint256 srcAmount,
        uint256 minDestAmount,
        Call[] calldata calls
    ) external returns (uint256 destAmount) {
        // Transfer source tokens from user to this contract
        IERC20(srcToken).safeTransferFrom(msg.sender, address(this), srcAmount);
        console.log("Transferred %s source tokens from user", srcAmount);

        // Get initial balance of destination token
        uint256 initialDestBalance = IERC20(destToken).balanceOf(address(this));
        console.log("Initial destination token balance: %s", initialDestBalance);

        // Execute the multicall (should include approval and swap calls)
        Result[] memory results = multicall(calls);
        
        // Check if all required calls succeeded
        for (uint256 i = 0; i < calls.length; i++) {
            if (!results[i].success && !calls[i].allowFailure) {
                revert("Required call failed");
            }
        }

        // Get final balance of destination token
        uint256 finalDestBalance = IERC20(destToken).balanceOf(address(this));
        destAmount = finalDestBalance - initialDestBalance;
        console.log("Final destination token balance: %s", finalDestBalance);
        console.log("Destination amount received: %s", destAmount);

        // Check if minimum destination amount is met
        require(destAmount >= minDestAmount, "Slippage too high");

        // Transfer destination tokens to user
        IERC20(destToken).safeTransfer(msg.sender, destAmount);
        console.log("Transferred %s destination tokens to user", destAmount);

        // Emit event
        emit SwapExecuted(srcToken, destToken, srcAmount, destAmount, msg.sender);

        return destAmount;
    }


    /**
     * @dev Recover any ERC20 tokens accidentally sent to this contract
     * @param token Address of the token to recover
     * @param amount Amount to recover
     */
    function recoverTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).safeTransfer(owner(), amount);
    }
}