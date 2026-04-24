// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Nox, euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {IWrappedUSDC} from "./interfaces/IWrappedUSDC.sol";

/**
 * @title DisbursementVault
 * @notice Shared vault contract. Any payer who calls wrappedUsdc.setOperator(vault, deadline)
 *         can use this vault. DisbursementAgent passes the payer address at execution time.
 *
 *         Amount proofs must be encrypted by the off-chain agent bound to the wrappedUsdc address.
 *         Proof validation happens inside confidentialTransferFrom — no separate fromExternal call needed.
 */
contract DisbursementVault {
    IWrappedUSDC public immutable wrappedUsdc;
    address public immutable agent;

    error UnauthorizedCaller(address caller);
    error OperatorNotActive(address payer);

    event DisbursementExecuted(bytes32 indexed policyId, address indexed payer, address indexed recipient);

    constructor(address _wrappedUsdc, address _agent) {
        wrappedUsdc = IWrappedUSDC(_wrappedUsdc);
        agent = _agent;
    }

    /**
     * @notice Execute a single disbursement. Only callable by the registered DisbursementAgent.
     * @param payer            The token holder whose operator approval covers this vault.
     * @param recipient        The disbursement recipient.
     * @param encryptedAmount  Encrypted USDC amount — proof must be bound to wrappedUsdc address.
     * @param inputProof       Nox input proof from off-chain encryptInput().
     * @param policyId         Off-chain policy identifier for event correlation.
     */
    function executeDisbursement(
        address payer,
        address recipient,
        externalEuint256 encryptedAmount,
        bytes calldata inputProof,
        bytes32 policyId
    ) external returns (euint256) {
        if (msg.sender != agent) revert UnauthorizedCaller(msg.sender);
        if (!wrappedUsdc.isOperator(payer, address(this))) revert OperatorNotActive(payer);

        euint256 transferred = wrappedUsdc.confidentialTransferFrom(
            payer,
            recipient,
            encryptedAmount,
            inputProof
        );
        Nox.allowThis(transferred);
        Nox.allow(transferred, agent);

        emit DisbursementExecuted(policyId, payer, recipient);
        return transferred;
    }
}
