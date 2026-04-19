// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";

interface IWrappedUSDC {
    function confidentialTransferFrom(
        address from,
        address to,
        externalEuint256 encryptedAmount,
        bytes calldata inputProof
    ) external returns (euint256 transferred);

    function setOperator(address operator, uint48 until) external;

    function isOperator(address holder, address spender) external view returns (bool);

    function confidentialBalanceOf(address account) external view returns (euint256);
}
