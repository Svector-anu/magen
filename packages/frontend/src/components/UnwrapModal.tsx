import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { useConfidentialBalance, useUnwrap } from "../hooks/useUnwrap.js";
import { formatUsdc } from "../hooks/useWrapUsdc.js";
import styles from "./UnwrapModal.module.css";

type Step =
  | "idle"
  | "decrypting"
  | "no-balance"
  | "ready"
  | "claiming"
  | "proof-pending"
  | "finalizing"
  | "done"
  | "error";

interface Props {
  onClose: () => void;
}

export function UnwrapModal({ onClose }: Props) {
  const { address } = useAccount();
  const [step, setStep] = useState<Step>("idle");
  const [finalTxHash, setFinalTxHash] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [unwrapRequestId, setUnwrapRequestId] = useState<`0x${string}` | null>(null);

  const { data: balanceHandle, isLoading: isBalanceLoading } = useConfidentialBalance(address);

  const {
    decryptBalance, decryptedBalance, decrypting, decryptError,
    startUnwrap, isUnwrapPending, isUnwrapConfirming, isUnwrapConfirmed, unwrapWriteError, parseRequestId,
    finalizeUnwrap, proofPending, proofError,
    isFinalizePending, isFinalizeConfirming, isFinalizeConfirmed, finalizeHash, finalizeWriteError,
    reset, ZERO_HANDLE,
  } = useUnwrap();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Transition: decrypting state
  useEffect(() => {
    if (decrypting) setStep("decrypting");
  }, [decrypting]);

  useEffect(() => {
    if (decryptError) {
      setLocalError(decryptError);
      setStep("error");
    }
  }, [decryptError]);

  useEffect(() => {
    if (decryptedBalance !== null && step === "decrypting") setStep("ready");
  }, [decryptedBalance, step]);

  // Transition: unwrap tx confirmed → get TEE proof
  useEffect(() => {
    if (!isUnwrapConfirmed || step !== "claiming") return;
    const reqId = parseRequestId();
    if (!reqId) {
      setLocalError("Could not find unwrap request in transaction logs.");
      setStep("error");
      return;
    }
    setUnwrapRequestId(reqId);
    setStep("proof-pending");
    void finalizeUnwrap(reqId);
  }, [isUnwrapConfirmed, step]);

  // Transition: proof + finalize tx sent
  useEffect(() => {
    if (proofError) {
      setLocalError(proofError);
      setStep("error");
    }
  }, [proofError]);

  useEffect(() => {
    if ((isFinalizePending || isFinalizeConfirming) && step === "proof-pending") {
      setStep("finalizing");
    }
  }, [isFinalizePending, isFinalizeConfirming, step]);

  useEffect(() => {
    if (isFinalizeConfirmed && step === "finalizing") {
      setFinalTxHash(finalizeHash ?? null);
      setStep("done");
    }
  }, [isFinalizeConfirmed, step, finalizeHash]);

  function handleDecrypt() {
    if (!balanceHandle) return;
    if (balanceHandle === ZERO_HANDLE) {
      setStep("no-balance");
      return;
    }
    void decryptBalance(balanceHandle);
  }

  function handleClaim() {
    if (!address || !balanceHandle) return;
    setStep("claiming");
    startUnwrap(address, balanceHandle);
  }

  function handleRetry() {
    reset();
    setLocalError(null);
    setUnwrapRequestId(null);
    setStep("idle");
  }

  const writeError = unwrapWriteError ?? finalizeWriteError;
  const displayError = localError ?? (writeError ? String(writeError) : null);

  const isLoadingBalance = isBalanceLoading || !balanceHandle;
  const balanceFormatted = decryptedBalance !== null ? formatUsdc(decryptedBalance) : null;

  return (
    <div className={styles.backdrop} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <span className={styles.title}>claim usdc</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="close">✕</button>
        </div>

        <div className={styles.body}>
          {step === "done" ? (
            <div className={styles.doneBlock}>
              <div className={styles.doneIcon}>✓</div>
              <div className={styles.doneText}>USDC released to your wallet</div>
              {balanceFormatted && (
                <div className={styles.doneAmount}>{balanceFormatted} USDC claimed</div>
              )}
              {finalTxHash && (
                <a
                  className={styles.txLink}
                  href={`https://sepolia.arbiscan.io/tx/${finalTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {finalTxHash.slice(0, 16)}…{finalTxHash.slice(-8)} ↗
                </a>
              )}
              <button className={styles.btnPrimary} onClick={onClose}>done</button>
            </div>
          ) : step === "no-balance" ? (
            <div className={styles.emptyBlock}>
              <div className={styles.emptyIcon}>◈</div>
              <div className={styles.emptyText}>No cUSDC balance to claim</div>
              <div className={styles.emptyNote}>
                You haven't received any confidential USDC payments yet.
              </div>
              <button className={styles.btnGhost} onClick={onClose}>close</button>
            </div>
          ) : step === "error" ? (
            <div className={styles.errorBlock}>
              <div className={styles.errorMsg}>{displayError}</div>
              <button className={styles.btnGhost} onClick={handleRetry}>try again</button>
            </div>
          ) : (
            <>
              <div className={styles.explain}>
                Convert your received cUSDC back to regular USDC. This requires two on-chain transactions
                and a brief decryption step via the Nox TEE.
              </div>

              {/* Step indicators */}
              <div className={styles.steps}>
                <StepDot active={step === "decrypting"} done={decryptedBalance !== null} label="decrypt balance" />
                <div className={styles.stepLine} />
                <StepDot active={step === "claiming"} done={isUnwrapConfirmed} label="unwrap tx" />
                <div className={styles.stepLine} />
                <StepDot active={step === "proof-pending"} done={!!unwrapRequestId && step !== "proof-pending"} label="TEE proof" />
                <div className={styles.stepLine} />
                <StepDot active={step === "finalizing"} done={isFinalizeConfirmed} label="release tx" />
              </div>

              {/* Balance row (shown once decrypted) */}
              {decryptedBalance !== null && (
                <div className={styles.balanceRow}>
                  <span className={styles.balanceLabel}>claimable cUSDC</span>
                  <span className={styles.balanceVal}>{balanceFormatted} USDC</span>
                </div>
              )}

              {/* Status messages */}
              {step === "idle" && (
                <div className={styles.statusMsg}>
                  {isLoadingBalance
                    ? "loading your encrypted balance…"
                    : "your cUSDC balance is encrypted on-chain — decrypt to view it"}
                </div>
              )}
              {step === "decrypting" && (
                <div className={styles.statusMsg}>
                  <Spinner /> decrypting your balance via the TEE…
                </div>
              )}
              {step === "claiming" && (
                <div className={styles.statusMsg}>
                  {isUnwrapPending && "confirm the unwrap transaction in your wallet…"}
                  {isUnwrapConfirming && "waiting for unwrap confirmation on-chain…"}
                </div>
              )}
              {step === "proof-pending" && (
                <div className={styles.statusMsg}>
                  <Spinner /> requesting decryption proof from the TEE — this may take a moment…
                </div>
              )}
              {step === "finalizing" && (
                <div className={styles.statusMsg}>
                  {isFinalizePending && "confirm the release transaction in your wallet…"}
                  {isFinalizeConfirming && "releasing USDC on-chain…"}
                </div>
              )}

              {/* Action buttons */}
              {step === "idle" && !isLoadingBalance && (
                <button className={styles.btnPrimary} onClick={handleDecrypt}>
                  decrypt balance
                </button>
              )}
              {step === "ready" && (
                <button className={styles.btnPrimary} onClick={handleClaim}>
                  claim {balanceFormatted} USDC ▸
                </button>
              )}

              <div className={styles.note}>
                Two transactions required. Gas on Arbitrum Sepolia.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function StepDot({
  active,
  done,
  label,
}: {
  active: boolean;
  done: boolean;
  label: string;
}) {
  return (
    <div className={styles.stepDotWrap}>
      <div
        className={`${styles.stepDot} ${active ? styles.stepDotActive : ""} ${done ? styles.stepDotDone : ""}`}
      >
        {done ? "✓" : ""}
      </div>
      <span className={styles.stepLabel}>{label}</span>
    </div>
  );
}

function Spinner() {
  return <span className={styles.spinner} />;
}
