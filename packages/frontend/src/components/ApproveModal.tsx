import { useEffect, useState } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { walletMessage, currentMinute } from "../lib/api.js";
import type { DisbursementPolicy } from "@magen/shared";
import { CONTRACTS_READY, VAULT_ADDRESS } from "../lib/contracts.js";
import { useSetOperator, useIsOperator, computeDeadline, deadlineLabel } from "../hooks/useApprove.js";
import { api } from "../lib/api.js";
import styles from "./ApproveModal.module.css";

interface Props {
  policy: DisbursementPolicy;
  onClose: () => void;
}

export function ApproveModal({ policy, onClose }: Props) {
  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const { signMessageAsync } = useSignMessage();
  const { data: alreadyOperator, isLoading: checkingOperator } = useIsOperator(address);
  const { setOperator, hash, isPending, isConfirming, isSuccess, error, reset } = useSetOperator();
  const [jobId, setJobId] = useState<string | null>(null);
  const [execTxHash, setExecTxHash] = useState<string | null>(null);
  const [execError, setExecError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Step 1: save policy + queue first job once operator is confirmed.
  // Requires a fresh wallet signature to prove ownership — a MetaMask sign prompt
  // appears after the setOperator tx confirms.
  useEffect(() => {
    if (!isSuccess || !VAULT_ADDRESS || !address || isExecuting || jobId || execTxHash || execError) return;
    setIsExecuting(true);
    const minute = currentMinute();
    signMessageAsync({ message: walletMessage("save-policy", minute) })
      .then((sig) => {
        if (!address || !VAULT_ADDRESS) throw new Error("Wallet or vault not available");
        return api.savePolicy({ policy, vaultAddress: VAULT_ADDRESS }, String(address), sig, minute);
      })
      .then((res) => setJobId(res.jobId))
      .catch((err: unknown) => {
        setExecError(err instanceof Error ? err.message : String(err));
        setIsExecuting(false);
      });
  }, [isSuccess, policy, isExecuting, jobId, execTxHash, execError, address, signMessageAsync]);

  // Step 2: poll job status until done or failed
  useEffect(() => {
    if (!jobId || execTxHash || execError) return;
    const interval = setInterval(async () => {
      try {
        const job = await api.getJobStatus(jobId);
        if (job.status === "done" && job.txHash) {
          setExecTxHash(job.txHash);
          setIsExecuting(false);
          clearInterval(interval);
        } else if (job.status === "failed") {
          setExecError(job.error ?? "Disbursement failed");
          setIsExecuting(false);
          clearInterval(interval);
        }
      } catch {
        // ignore transient poll errors
      }
    }, 3_000);
    return () => clearInterval(interval);
  }, [jobId, execTxHash, execError]);

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
            confirm payment
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
            <div className={styles.authExplain}>
              run scheduled payments from your wallet. your balance stays private — only the scheduled amount moves.
            </div>
            <div className={styles.authDetails}>
              <div className={styles.authRow}>
                <span className={styles.authKey}>runs until</span>
                <span className={`${styles.authVal} ${policy.approval_mode === "continue-until-revoked" ? styles.amber : ""}`}>
                  {deadline}
                </span>
              </div>
              <div className={styles.authRow}>
                <span className={styles.authKey}>privacy</span>
                <span className={styles.authVal}>amount is hidden onchain by default</span>
              </div>
              {alreadyOperator && !checkingOperator && (
                <div className={styles.authRow}>
                  <span className={styles.authKey}>status</span>
                  <span className={styles.green}>approval active — signing again extends it</span>
                </div>
              )}
            </div>
          </div>

          {isSuccess && hash && (
            <div className={styles.successBlock}>
              <span className={styles.successIcon}>✓</span>
              <div>
                <div className={styles.successTitle}>wallet approved</div>
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

          {isExecuting && (
            <div className={styles.successBlock}>
              <span className={styles.successIcon}>⏳</span>
              <div>
                <div className={styles.successTitle}>running…</div>
              </div>
            </div>
          )}

          {execTxHash && (
            <div className={styles.successBlock}>
              <span className={styles.successIcon}>✓</span>
              <div>
                <div className={styles.successTitle}>payment sent (private)</div>
                <a
                  className={styles.txLink}
                  href={`https://sepolia.arbiscan.io/tx/${execTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {execTxHash.slice(0, 16)}…{execTxHash.slice(-8)} ↗
                </a>
              </div>
            </div>
          )}

          {execError && (
            <div className={styles.errorBlock}>
              <span className={styles.errorIcon}>✕</span>
              <span className={styles.errorText}>something went wrong. retrying automatically.</span>
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
              connect wallet to continue
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
                  : "approve & sign ▸"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
