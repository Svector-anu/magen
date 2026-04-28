import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useSignMessage } from "wagmi";
import { walletMessage, currentMinute } from "../lib/api.js";
import type { DisbursementPolicy } from "@magen/shared";
import { CONTRACTS_READY, VAULT_ADDRESS } from "../lib/contracts.js";
import { useSetOperator, useIsOperator, computeDeadline, deadlineLabel } from "../hooks/useApprove.js";
import { useUsdcBalance, formatUsdc } from "../hooks/useWrapUsdc.js";
import { api } from "../lib/api.js";
import { WrongChainBanner } from "./WrongChainBanner.js";
import { WrapUsdcModal } from "./WrapUsdcModal.js";
import styles from "./ApproveModal.module.css";

interface Props {
  policy: DisbursementPolicy;
  onClose: () => void;
}

export function ApproveModal({ policy, onClose }: Props) {
  const { authenticated, login } = usePrivy();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const { data: alreadyOperator, isLoading: checkingOperator } = useIsOperator(address);
  const { setOperator, hash, isPending, isConfirming, isSuccess, error, reset } = useSetOperator();
  const [jobId, setJobId] = useState<string | null>(null);
  const [execTxHash, setExecTxHash] = useState<string | null>(null);
  const [execError, setExecError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [awaitingSignature, setAwaitingSignature] = useState(false);

  const [readyToSave, setReadyToSave] = useState(false);
  const [revokeWarning, setRevokeWarning] = useState(false);
  const [auditorConfirmed, setAuditorConfirmed] = useState(false);
  const [showWrap, setShowWrap] = useState(false);

  const { data: usdcBalance } = useUsdcBalance(address);

  const hasAuditor = !!policy.auditor_wallet;

  const isAskEveryTime = policy.approval_mode === "ask-every-time";
  const isContinueUntilRevoked = policy.approval_mode === "continue-until-revoked";

  // The save step triggers when: setOperator confirmed (period/revoked) OR skip (ask-every-time)
  const saveTrigger = isAskEveryTime ? readyToSave : isSuccess;

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Save policy once the appropriate step 1 is done
  useEffect(() => {
    if (!saveTrigger || !VAULT_ADDRESS || !address || isExecuting || jobId || execTxHash || execError) return;
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
  }, [saveTrigger, policy, isExecuting, jobId, execTxHash, execError, address, signMessageAsync]);

  // Poll until first job executes (not applicable for ask-every-time but harmless)
  useEffect(() => {
    if (!jobId || execTxHash || execError || isAskEveryTime) return;
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
  }, [jobId, execTxHash, execError, isAskEveryTime]);

  function handleApprove() {
    if (isAskEveryTime) {
      setReadyToSave(true);
      return;
    }
    if (isContinueUntilRevoked && !revokeWarning) {
      setRevokeWarning(true);
      return;
    }
    let deadline: number;
    try {
      deadline = computeDeadline(policy);
    } catch (e) {
      setExecError(e instanceof Error ? e.message : "Invalid policy deadline");
      return;
    }
    setOperator(deadline);
  }

  const deadline = deadlineLabel(policy);
  const isAllDone = isAskEveryTime ? !!jobId : !!execTxHash;

  // Step numbers adapt to mode
  const step = isAskEveryTime
    ? !readyToSave ? 1 : !jobId ? 2 : 2
    : !isSuccess ? 1 : !jobId ? 2 : !execTxHash ? 3 : 3;

  return (
    <>
    {showWrap && <WrapUsdcModal onClose={() => setShowWrap(false)} />}
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <div className={styles.modalTitle}>set up payment schedule</div>
          <button className={styles.closeBtn} onClick={onClose} aria-label="close">✕</button>
        </div>

        <div className={styles.modalBody}>
          <WrongChainBanner />
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
          {isAskEveryTime ? (
            <div className={styles.steps}>
              <div className={`${styles.step} ${step >= 1 ? styles.stepActive : ""} ${jobId ? styles.stepDone : ""}`}>
                <span className={styles.stepNum}>{jobId ? "✓" : "1"}</span>
                <span className={styles.stepLabel}>Save schedule</span>
                <span className={styles.stepSub}>free · no gas</span>
              </div>
              <div className={styles.stepLine} />
              <div className={`${styles.step} ${jobId ? styles.stepActive : ""}`}>
                <span className={styles.stepNum}>2</span>
                <span className={styles.stepLabel}>Approve each cycle</span>
                <span className={styles.stepSub}>you sign each payment</span>
              </div>
            </div>
          ) : (
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
              <span className={styles.recapVal}>
                {isAskEveryTime
                  ? "you approve each payment"
                  : isContinueUntilRevoked
                  ? "runs until you revoke"
                  : "approved for period"}
              </span>
            </div>
            {deadline && !isAskEveryTime && (
              <div className={styles.recapRow}>
                <span className={styles.recapKey}>runs until</span>
                <span className={`${styles.recapVal} ${isContinueUntilRevoked ? styles.amber : ""}`}>
                  {deadline}
                </span>
              </div>
            )}
          </div>

          {isContinueUntilRevoked && !isSuccess && (
            <div className={`${styles.notice} ${revokeWarning ? styles.noticeWarn : ""}`}>
              <span className={styles.noticeIcon}>⚠</span>
              <div>
                <div className={styles.noticeTitle}>
                  {revokeWarning ? "confirm indefinite authorization" : "runs until you revoke"}
                </div>
                <div className={styles.noticeText}>
                  {revokeWarning
                    ? "Magen will execute payments automatically with no expiry. You must actively revoke this from your dashboard to stop it."
                    : "Payments will continue indefinitely. Revoke anytime from your dashboard."}
                </div>
              </div>
            </div>
          )}

          {isAskEveryTime && !readyToSave && (
            <div className={styles.notice}>
              <span className={styles.noticeIcon}>ℹ</span>
              <div>
                <div className={styles.noticeTitle}>you approve each payment</div>
                <div className={styles.noticeText}>
                  Each cycle you'll get a notification and must sign to release the payment. If you don't approve, that cycle is skipped.
                </div>
              </div>
            </div>
          )}

          {hasAuditor && !isAllDone && (
            <div className={styles.auditorBlock}>
              <div className={styles.auditorHeader}>
                <span className={styles.auditorIcon}>⚠</span>
                <span className={styles.auditorTitle}>permanent auditor access</span>
              </div>
              <div className={styles.auditorBody}>
                Granting{" "}
                <code className={styles.auditorAddr}>
                  {policy.auditor_wallet!.slice(0, 6)}…{policy.auditor_wallet!.slice(-4)}
                </code>{" "}
                read access to{" "}
                <strong>{policy.recipient_display_name}</strong>'s disbursement handle is{" "}
                <strong>permanent and cannot be revoked</strong>. Future cycle handles will need
                separate grants.
              </div>
              <label className={styles.auditorCheck}>
                <input
                  type="checkbox"
                  checked={auditorConfirmed}
                  onChange={(e) => setAuditorConfirmed(e.target.checked)}
                />
                <span>I understand this disclosure is irreversible</span>
              </label>
            </div>
          )}

          {!isAllDone && usdcBalance !== undefined && (
            <div className={styles.fundingBlock}>
              <div className={styles.fundingLeft}>
                <span className={styles.fundingLabel}>your usdc balance</span>
                <span className={`${styles.fundingVal} ${usdcBalance === 0n ? styles.fundingValZero : ""}`}>
                  {usdcBalance > 0n ? `${formatUsdc(usdcBalance)} USDC` : "0 — not funded yet"}
                </span>
              </div>
              {usdcBalance > 0n ? (
                <button className={styles.btnWrap} onClick={() => setShowWrap(true)}>
                  wrap USDC →
                </button>
              ) : (
                <a
                  className={styles.faucetLink}
                  href="https://faucet.circle.com"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  get USDC ↗
                </a>
              )}
            </div>
          )}

          {!isSuccess && !isAskEveryTime && (
            <div className={styles.authBlock}>
              <div className={styles.authRow}>
                <span className={styles.authKey}>privacy</span>
                <span className={styles.authVal}>amount encrypted end-to-end — hidden on-chain by default</span>
              </div>
              <div className={styles.authRow}>
                <span className={styles.authKey}>custody</span>
                <span className={styles.authVal}>only the scheduled amount moves — your balance stays yours</span>
              </div>
              {alreadyOperator && !checkingOperator && (
                <div className={styles.authRow}>
                  <span className={styles.authKey}>status</span>
                  <span className={styles.green}>already authorized — signing again extends it</span>
                </div>
              )}
            </div>
          )}

          {/* Step 1 tx confirmed (period / revoked modes) */}
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

          {/* Awaiting free signature */}
          {awaitingSignature && (
            <div className={styles.infoBlock}>
              <span className={styles.infoIcon}>✍</span>
              <div>
                <div className={styles.infoTitle}>sign in your wallet</div>
                <div className={styles.infoText}>Free signature — no gas. This saves your payment schedule.</div>
              </div>
            </div>
          )}

          {/* ask-every-time: schedule saved */}
          {isAskEveryTime && jobId && (
            <div className={styles.successBlock}>
              <span className={styles.successIcon}>✓</span>
              <div>
                <div className={styles.successTitle}>schedule saved</div>
                <div className={styles.infoText} style={{ marginTop: 4 }}>
                  You'll get a notification to approve each payment cycle.
                </div>
              </div>
            </div>
          )}

          {/* Step 3 polling (period / revoked modes) */}
          {!isAskEveryTime && jobId && !execTxHash && !execError && (
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
              <span className={styles.errorText}>
                Payment execution failed — check your dashboard and use "send now" to retry.
                {execError.length < 200 ? ` (${execError})` : ""}
              </span>
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
          ) : execError ? (
            <button className={styles.btnDone} onClick={onClose}>
              close — check dashboard
            </button>
          ) : !authenticated ? (
            <button className={styles.btnPrimary} onClick={login}>
              sign in to continue
            </button>
          ) : isSuccess || (isAskEveryTime && readyToSave) ? (
            <button className={styles.btnPrimary} disabled>
              {awaitingSignature ? "sign in wallet (free)…" : jobId ? (isAskEveryTime ? "schedule saved" : "sending payment…") : "saving schedule…"}
            </button>
          ) : (
            <>
              <button className={styles.btnGhost} onClick={onClose} disabled={isPending || isConfirming}>
                cancel
              </button>
              <button
                className={styles.btnPrimary}
                onClick={error ? () => { reset(); handleApprove(); } : handleApprove}
                disabled={!CONTRACTS_READY || isPending || isConfirming || checkingOperator || (hasAuditor && !auditorConfirmed)}
              >
                {isPending
                  ? "confirm in wallet…"
                  : isConfirming
                  ? "confirming on Arbitrum…"
                  : isContinueUntilRevoked && revokeWarning
                  ? "yes, authorize indefinitely ▸"
                  : "authorize & schedule ▸"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
