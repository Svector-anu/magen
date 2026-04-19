// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {euint256, externalEuint256} from "@iexec-nox/nox-protocol-contracts/contracts/sdk/Nox.sol";
import {DisbursementVault} from "./DisbursementVault.sol";

/**
 * @title DisbursementAgent
 * @notice Singleton contract that the off-chain Magen API server calls to execute disbursements.
 *         The server wallet must be the owner. Each vault must have this contract set as its agent.
 *
 *         Keeps execution off the payer's key — the payer never needs to sign execution transactions.
 */
contract DisbursementAgent {
    address public immutable owner;

    error UnauthorizedCaller(address caller);

    event ExecutionRouted(address indexed vault, bytes32 indexed policyId);

    constructor(address _owner) {
        owner = _owner;
    }

    /**
     * @notice Route a disbursement through a payer's vault. Only callable by the owner (API server wallet).
     * @param vault            The payer's DisbursementVault contract.
     * @param recipient        The disbursement recipient.
     * @param encryptedAmount  Encrypted USDC amount bound to wrappedUsdc address.
     * @param inputProof       Nox input proof from off-chain encryptInput().
     * @param policyId         Off-chain policy ID for event correlation.
     */
    function execute(
        address vault,
        address recipient,
        externalEuint256 encryptedAmount,
        bytes calldata inputProof,
        bytes32 policyId
    ) external {
        if (msg.sender != owner) revert UnauthorizedCaller(msg.sender);

        emit ExecutionRouted(vault, policyId);

        DisbursementVault(vault).executeDisbursement(
            recipient,
            encryptedAmount,
            inputProof,
            policyId
        );
    }
}
