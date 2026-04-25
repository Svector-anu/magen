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
  const [awaitingSignature, setAwaitingSignature] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Step 2: once setOperator confirms, ask for a free signature to save the policy
  useEffect(() => {
    if (!isSuccess || !VAULT_ADDRESS || !address || isExecuting || jobId || execTxHash || execError) return;
    setIsExecuting(true);
    setAwaitingSignature(true);
    const minute = currentMinute();
    signMessageAsync({ message: walletMessage("save-policy", minute) })
      .then((sig) => {
        setAwaitingSignature(false);
        if (!address || !VAULT_ADDRESS) throw new Error("Wallet or vault not available");
        return api.savePolicy({ policy, vaultAddress: VAULT_ADDRESS }, String(address), sig, minute);
      })
      .then((res) => setJobId(res.jobId))
      .catch((err: unknown) => {
        setAwaitingSignature(false);
        setExecError(err instanceof Error ? err.message : String(err));
        setIsExecuting(false);
      });
  }, [isSuccess, policy, isExecuting, jobId, execTxHash, execError, address, signMessageAsync]);

  // Step 3: poll until first job executes
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
  const isAllDone = !!execTxHash;

  // Step number for UI
  const step = !isSuccess ? 1 : !jobId ? 2 : !execTxHash ? 3 : 3;

  return (
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>set up payment schedule</div>
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

          {/* Step indicator */}
          <div className={styles.steps}>
            <div className={`${styles.step} ${step >= 1 ? styles.stepActive : ""} ${isSuccess ? styles.stepDone : ""}`}>
              <span className={styles.stepNum}>{isSuccess ? "✓" : "1"}</span>
              <span className={styles.stepLabel}>Authorize on-chain</span>
              <span className={styles.stepSub}>one-time · small gas fee</span>
            </div>
            <div className={styles.stepLine} />
            <div className={`${styles.step} ${step >= 2 ? styles.stepActive : ""} ${jobId ? styles.stepDone : ""}`}>
              <span className={styles.stepNum}>{jobId ? "✓" : "2"}</span>
              <span className={styles.stepLabel}>Save schedule</span>
              <span className={styles.stepSub}>free · no gas</span>
            </div>
            <div className={styles.stepLine} />
            <div className={`${styles.step} ${step >= 3 ? styles.stepActive : ""} ${execTxHash ? styles.stepDone : ""}`}>
              <span className={styles.stepNum}>{execTxHash ? "✓" : "3"}</span>
              <span className={styles.stepLabel}>First payment</span>
              <span className={styles.stepSub}>private · on-chain</span>
            </div>
          </div>

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
              <span className={styles.recapKey}>runs until</span>
              <span className={`${styles.recapVal} ${policy.approval_mode === "continue-until-revoked" ? styles.amber : ""}`}>
                {deadline}
              </span>
            </div>
          </div>

          <div className={styles.authBlock}>
            <div className={styles.authExplain}>
              {!isSuccess
                ? "Step 1 grants Magen permission to send USDC from your wallet on schedule. Your balance stays private — only the scheduled amount moves each time. You can revoke this at any time."
                : awaitingSignature
                ? "Step 2 — sign to save your payment schedule. This is a free off-chain signature, no gas required."
                : jobId && !execTxHash
                ? "Schedule saved. Processing your first payment privately on-chain…"
                : execTxHash
                ? "All done. Your payment schedule is live."
                : "Authorizing…"}
            </div>
            {!isSuccess && (
              <div className={styles.authDetails}>
                <div className={styles.authRow}>
                  <span className={styles.authKey}>privacy</span>
                  <span className={styles.authVal}>amount hidden on-chain by default</span>
                </div>
                {alreadyOperator && !checkingOperator && (
                  <div className={styles.authRow}>
                    <span className={styles.authKey}>status</span>
                    <span className={styles.green}>already authorized — signing again extends it</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 1 tx confirmed */}
          {isSuccess && hash && (
            <div className={styles.successBlock}>
              <span className={styles.successIcon}>✓</span>
              <div>
                <div className={styles.successTitle}>authorized on Arbitrum</div>
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

          {/* Step 2 awaiting signature */}
          {awaitingSignature && (
            <div className={styles.infoBlock}>
              <span className={styles.infoIcon}>✍</span>
              <div>
                <div className={styles.infoTitle}>sign in your wallet</div>
                <div className={styles.infoText}>Free signature — no gas. This saves your payment schedule.</div>
              </div>
            </div>
          )}

          {/* Step 3 polling */}
          {jobId && !execTxHash && !execError && (
            <div className={styles.paymentFlow}>
              <div className={styles.flowNode}>
                <div className={styles.flowNodeBox}>
                  <span className={styles.flowNodeAddr}>
                    {address ? `${String(address).slice(0, 6)}…${String(address).slice(-4)}` : "you"}
                  </span>
                </div>
                <span className={styles.flowNodeLabel}>sender</span>
              </div>

              <div className={styles.flowConnector}>
                <div className={styles.flowLine} />
                <span className={styles.flowDot} />
                <span className={`${styles.flowDot} ${styles.flowDot2}`} />
                <span className={`${styles.flowDot} ${styles.flowDot3}`} />
              </div>

              <div className={`${styles.flowNode} ${styles.flowNodeTee}`}>
                <div className={`${styles.flowNodeBox} ${styles.flowNodeBoxTee}`}>
                  <span className={styles.flowLock}>⬡</span>
                  <span className={styles.flowTeeLabel}>TEE</span>
                </div>
                <span className={styles.flowNodeLabel}>encrypting</span>
              </div>

              <div className={styles.flowConnector}>
                <div className={styles.flowLine} />
                <span className={`${styles.flowDot} ${styles.flowDotDelay}`} />
                <span className={`${styles.flowDot} ${styles.flowDot2} ${styles.flowDotDelay}`} />
                <span className={`${styles.flowDot} ${styles.flowDot3} ${styles.flowDotDelay}`} />
              </div>

              <div className={styles.flowNode}>
                <div className={styles.flowNodeBox}>
                  <span className={styles.flowNodeAddr}>{policy.recipient_display_name}</span>
                </div>
                <span className={styles.flowNodeLabel}>recipient</span>
              </div>
            </div>
          )}

          {/* Step 3 done */}
          {execTxHash && (
            <div className={styles.successBlock}>
              <span className={styles.successIcon}>✓</span>
              <div>
                <div className={styles.successTitle}>first payment sent (private)</div>
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
          {isAllDone ? (
            <button className={styles.btnDone} onClick={onClose}>
              done ✓
            </button>
          ) : !isConnected ? (
            <button className={styles.btnPrimary} onClick={openConnectModal}>
              connect wallet to continue
            </button>
          ) : isSuccess ? (
            <button className={styles.btnPrimary} disabled>
              {awaitingSignature ? "sign in wallet (free)…" : jobId ? "sending payment…" : "saving schedule…"}
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
                  ? "confirm in wallet…"
                  : isConfirming
                  ? "confirming on Arbitrum…"
                  : "authorize & schedule ▸"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
