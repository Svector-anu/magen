// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/interfaces/IERC20.sol";
import {ERC20ToERC7984Wrapper} from "@iexec-nox/nox-confidential-contracts/contracts/token/extensions/ERC20ToERC7984Wrapper.sol";
import {ERC7984} from "@iexec-nox/nox-confidential-contracts/contracts/token/ERC7984.sol";

/**
 * @title WrappedUSDC
 * @notice Wraps ERC-20 USDC into an ERC-7984 confidential token for use in Magen disbursements.
 *         Wrap: user calls wrap(to, amount) — USDC is held in escrow, cUSDC minted confidentially.
 *         Unwrap: 2-step async — unwrap() burns cUSDC, finalizeUnwrap() releases USDC after TEE decryption.
 */
contract WrappedUSDC is ERC20ToERC7984Wrapper {
    constructor(address usdc)
        ERC20ToERC7984Wrapper(IERC20(usdc))
        ERC7984("Magen Wrapped USDC", "mwUSDC", "")
    {}
}
