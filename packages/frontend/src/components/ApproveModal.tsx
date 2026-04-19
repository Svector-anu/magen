import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import type { DisbursementPolicy } from "@magen/shared";
import { CONTRACTS_READY, VAULT_ADDRESS } from "../lib/contracts.js";
import { useSetOperator, useIsOperator, computeDeadline, deadlineLabel } from "../hooks/useApprove.js";
import styles from "./ApproveModal.module.css";

interface Props {
  policy: DisbursementPolicy;
  onClose: () => void;
}

export function ApproveModal({ policy, onClose }: Props) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { data: alreadyOperator, isLoading: checkingOperator } = useIsOperator(address);
  const { setOperator, hash, isPending, isConfirming, isSuccess, error, reset } = useSetOperator();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleApprove() {
    setOperator(computeDeadline(policy));
  }

  const deadline = deadlineLabel(policy);
  const vaultShort = VAULT_ADDRESS
    ? `${VAULT_ADDRESS.slice(0, 10)}…${VAULT_ADDRESS.slice(-8)}`
    : null;

  return (
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>
            <span className={styles.slash}>//</span> authorize disbursement
          </div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="close">✕</button>
        </div>

        <div className={styles.modalBody}>
          {!CONTRACTS_READY && (
            <div className={styles.notice}>
              <span className={styles.noticeIcon}>⚠</span>
              <div>
                <div className={styles.noticeTitle}>contracts not deployed</div>
                <div className={styles.noticeText}>
                  Set <code>VITE_WRAPPED_USDC_ADDRESS</code> and{" "}
                  <code>VITE_VAULT_ADDRESS</code> in your .env to enable on-chain approval.
                </div>
              </div>
            </div>
          )}

          <div className={styles.policyRecap}>
            <div className={styles.recapRow}>
              <span className={styles.recapKey}>recipient</span>
              <span className={styles.recapVal}>{policy.recipient_display_name}</span>
            </div>
            <div className={styles.recapRow}>
              <span className={styles.recapKey}>amount</span>
              <span className={`${styles.recapVal} ${styles.green}`}>{policy.amount_usdc} USDC</span>
            </div>
            <div className={styles.recapRow}>
              <span className={styles.recapKey}>frequency</span>
              <span className={styles.badge}>{policy.frequency}</span>
            </div>
            <div className={styles.recapRow}>
              <span className={styles.recapKey}>approval</span>
              <span className={styles.badge}>{policy.approval_mode}</span>
            </div>
          </div>

          <div className={styles.authBlock}>
            <div className={styles.authLabel}>
              <span className={styles.slash}>//</span> operator authorization
            </div>
            <div className={styles.authExplain}>
              Calling <code>setOperator</code> on WrappedUSDC grants the Magen vault
              permission to execute payments on your behalf. Your balance remains
              encrypted — only the vault can trigger transfers, and only within the
              authorized window.
            </div>
            <div className={styles.authDetails}>
              <div className={styles.authRow}>
                <span className={styles.authKey}>vault</span>
                <span className={styles.authVal}>
                  {vaultShort ?? <span className={styles.dimmed}>not configured</span>}
                </span>
              </div>
              <div className={styles.authRow}>
                <span className={styles.authKey}>authorized until</span>
                <span className={`${styles.authVal} ${policy.approval_mode === "continue-until-revoked" ? styles.amber : ""}`}>
                  {deadline}
                </span>
              </div>
              {alreadyOperator && !checkingOperator && (
                <div className={styles.authRow}>
                  <span className={styles.authKey}>status</span>
                  <span className={styles.green}>already active — re-signing extends deadline</span>
                </div>
              )}
            </div>
          </div>

          {isSuccess && hash && (
            <div className={styles.successBlock}>
              <span className={styles.successIcon}>✓</span>
              <div>
                <div className={styles.successTitle}>operator authorized</div>
                <a
                  className={styles.txLink}
                  href={`https://sepolia.arbiscan.io/tx/${hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {hash.slice(0, 16)}…{hash.slice(-8)} ↗
                </a>
              </div>
            </div>
          )}

          {error && (
            <div className={styles.errorBlock}>
              <span className={styles.errorIcon}>✕</span>
              <span className={styles.errorText}>
                {(error as { shortMessage?: string }).shortMessage ?? error.message}
              </span>
            </div>
          )}
        </div>

        <div className={styles.modalFooter}>
          {isSuccess ? (
            <button className={styles.btnDone} onClick={onClose}>
              done ✓
            </button>
          ) : !isConnected ? (
            <button className={styles.btnPrimary} onClick={openConnectModal}>
              connect wallet to approve
            </button>
          ) : (
            <>
              <button className={styles.btnGhost} onClick={onClose} disabled={isPending || isConfirming}>
                cancel
              </button>
              <button
                className={styles.btnPrimary}
                onClick={error ? () => { reset(); handleApprove(); } : handleApprove}
                disabled={!CONTRACTS_READY || isPending || isConfirming || checkingOperator}
              >
                {isPending
                  ? "sign in wallet…"
                  : isConfirming
                  ? "confirming…"
                  : "confirm & sign ▸"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
