// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IWrappedUSDC} from "./interfaces/IWrappedUSDC.sol";

/**
 * @title DisbursementVault
 * @notice Per-payer execution contract. The payer calls wrappedUsdc.setOperator(vault, deadline)
 *         to authorize this vault. The vault is then called by DisbursementAgent to move funds.
 *
 *         Amount proofs must be encrypted by the off-chain agent bound to the wrappedUsdc address.
 *         Proof validation happens inside confidentialTransferFrom — no separate fromExternal call needed.
 */
contract DisbursementVault {
    IWrappedUSDC public immutable wrappedUsdc;
    address public immutable agent;
    address public immutable payer;

    error UnauthorizedCaller(address caller);
    error OperatorNotActive();

    event DisbursementExecuted(bytes32 indexed policyId, address indexed recipient);

    constructor(address _wrappedUsdc, address _agent, address _payer) {
        wrappedUsdc = IWrappedUSDC(_wrappedUsdc);
        agent = _agent;
        payer = _payer;
    }

    /**
     * @notice Execute a single disbursement. Only callable by the registered DisbursementAgent.
     * @param recipient        The recipient address.
     * @param encryptedAmount  Encrypted USDC amount — proof must be bound to wrappedUsdc address.
     * @param inputProof       Nox input proof from off-chain encryptInput().
     * @param policyId         Off-chain policy identifier for event correlation.
     */
    function executeDisbursement(
        address recipient,
        externalEuint256 encryptedAmount,
        bytes calldata inputProof,
        bytes32 policyId
    ) external returns (euint256) {
        if (msg.sender != agent) revert UnauthorizedCaller(msg.sender);
        if (!wrappedUsdc.isOperator(payer, address(this))) revert OperatorNotActive();

        euint256 transferred = wrappedUsdc.confidentialTransferFrom(
            payer,
            recipient,
            encryptedAmount,
            inputProof
        );
        Nox.allowThis(transferred);

        emit DisbursementExecuted(policyId, recipient);
        return transferred;
    }
}
