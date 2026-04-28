import { useState, useRef, useEffect, useCallback } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { api, walletMessage, currentMinute } from "../lib/api.js";
import { getCached, getOrSign, invalidate } from "../lib/walletAuth.js";
import type { ParseErrorResponse, RecipientResolutionSource } from "../lib/api.js";
import type { DisbursementPolicy } from "@magen/shared";
import { ApproveModal } from "../components/ApproveModal.js";
import { EcosystemSection } from "../components/EcosystemSection.js";
import { OnboardingChecklist } from "../components/OnboardingChecklist.js";
import styles from "./Home.module.css";

const PLACEHOLDERS = [
  "pay dev 200 USDC weekly",
  "send alice 500 USDC every month",
  "pay contractor.eth 750 USDC on the 1st",
  "send 50 USDC to bob every friday",
];

const SUBLINES = [
  "Payments that run themselves.",
  "Set it once. Walk away.",
  "Never miss a payment again.",
  "Give your agent a wallet.",
  "Let your AI handle the bills.",
  "It just pays. Quietly.",
];

interface PolicyCardData {
  recipient_display_name: string;
  recipient_wallet: string;
  amount_usdc: string;
  frequency: string;
  approval_mode: string;
  start_date: string;
  end_date?: string;
  memo?: string;
  id?: string;
}

const DEMO: PolicyCardData = {
  recipient_display_name: "alice.eth",
  recipient_wallet: "0x3d2e9f4a8c1b7e5d2f6a9c3b8e1d4f7a2c5b8e1d",
  amount_usdc: "500.000000",
  frequency: "monthly",
  approval_mode: "approve-for-period",
  start_date: "2026-04-19T00:00:00Z",
  id: "demo",
};

type Stage = "idle" | "parsing" | "confirming" | "resolved" | "unresolved" | "error";

const SOURCE_LABEL: Record<string, string> = {
  contact: "saved contacts",
  ens: "ENS",
  farcaster: "Farcaster",
  farcaster_x: "X / Farcaster",
  address_only: "direct address",
  direct: "typed in instruction",
};

function fmtNextDate(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString("en-US", opts);
}

interface ActivePolicy {
  id: string;
  recipient_display_name: string;
  recipient_wallet: string;
  amount_usdc: string;
  frequency: string;
  next_execution_at: string;
  status: string;
}

export function Home() {
  const [instruction, setInstruction] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [policy, setPolicy] = useState<DisbursementPolicy | null>(null);
  const [enrichment, setEnrichment] = useState<{ onChainContext?: string }>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [subIdx, setSubIdx] = useState(0);
  const [subText, setSubText] = useState("");
  const [subErasing, setSubErasing] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [activePolicies, setActivePolicies] = useState<ActivePolicy[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [resolutionSource, setResolutionSource] = useState<RecipientResolutionSource>(null);
  const [unresolvedName, setUnresolvedName] = useState<string>("");

  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  // Stable ref so callbacks don't re-create when wagmi identity changes mid-connect
  const signRef = useRef(signMessageAsync);
  useEffect(() => { signRef.current = signMessageAsync; });

  const refreshPolicies = useCallback(async (foreground = false) => {
    if (!address) return;
    try {
      const auth = foreground
        ? await getOrSign(address, "list-policies", (msg) => signRef.current({ message: msg }))
        : getCached(address, "list-policies");
      if (!auth) return;
      const policies = await api.listPolicies(address, auth.sig, auth.minute);
      setActivePolicies(policies);
    } catch {
      // user rejected sign or request failed — leave list as-is
    }
  }, [address]);

  useEffect(() => {
    if (!address) {
      invalidate(address ?? "");
      setActivePolicies([]);
      return;
    }
    void refreshPolicies();
  }, [address, refreshPolicies]);

  useEffect(() => {
    const t = setInterval(
      () => setPlaceholderIdx((i) => (i + 1) % PLACEHOLDERS.length),
      3800
    );
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const phrase = SUBLINES[subIdx];
    if (!subErasing) {
      if (subText.length < phrase.length) {
        const t = setTimeout(() => setSubText(phrase.slice(0, subText.length + 1)), 48);
        return () => clearTimeout(t);
      }
      const t = setTimeout(() => setSubErasing(true), 2600);
      return () => clearTimeout(t);
    }
    if (subText.length > 0) {
      const t = setTimeout(() => setSubText((s) => s.slice(0, -1)), 24);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setSubIdx((i) => (i + 1) % SUBLINES.length);
      setSubErasing(false);
    }, 120);
    return () => clearTimeout(t);
  }, [subText, subErasing, subIdx]);

  async function handleParse() {
    if (!instruction.trim()) return;
    setStage("parsing");
    setErrors([]);
    try {
      const res = await api.parseInstruction(instruction);
      setPolicy(res.policy);
      setEnrichment(res.enrichment);
      setResolutionSource(res.recipientResolutionSource);
      setStage("confirming");
    } catch (err: unknown) {
      const data = (err as { data?: ParseErrorResponse }).data;
      if (data?.error === "recipient_unresolved") {
        setUnresolvedName(data.recipientDisplayName ?? "");
        setStage("unresolved");
      } else {
        setErrors(data?.validationErrors ?? ["Unexpected error"]);
        setStage("error");
      }
    }
  }

  function handleReset() {
    setStage("idle");
    setPolicy(null);
    setErrors([]);
    setInstruction("");
    setResolutionSource(null);
    setUnresolvedName("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  async function handleCancel(id: string) {
    if (!address) return;
    const minute = currentMinute();
    try {
      const sig = await signRef.current({ message: walletMessage("cancel-policy", minute) });
      await api.cancelPolicy(id, String(address), sig, minute);
    } catch {
      // user rejected sign or delete failed — do nothing
    }
    void refreshPolicies(true);
  }

  const canParse = instruction.trim().length > 0 && stage !== "parsing";
  const isDemo = stage !== "resolved" && stage !== "confirming";
  const previewData: PolicyCardData = (stage === "resolved" || stage === "confirming") && policy ? policy : DEMO;

  return (
    <>
    <div className={styles.page}>
      <div className={styles.container}>
        <section className={styles.hero}>
          <h1 className={styles.headline}>
            automate payments.<br />
            <span className={styles.headlineDim}>keep them private.</span>
          </h1>
          <p className={styles.subheadline}>
            {subText}<span className={styles.subCursor} />
          </p>
        </section>

        <OnboardingChecklist />

        <div className={styles.commandSection}>
          <div className={styles.inputWrap}>
            <span className={styles.promptChar}>magen&gt;</span>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleParse();
              }}
              placeholder={PLACEHOLDERS[placeholderIdx]}
              rows={2}
              disabled={stage === "parsing" || stage === "resolved"}
              autoFocus
            />
            {stage === "idle" && instruction.length === 0 && (
              <span className={styles.cursorBlock} />
            )}
          </div>

          <p className={styles.helperText}>describe your payment in plain english</p>

          <div className={styles.actions}>
            <div className={styles.actionsLeft}>
              {stage === "resolved" || stage === "confirming" ? (
                <button className={styles.btnGhost} onClick={handleReset}>
                  ← start over
                </button>
              ) : (
                <button
                  className={styles.btnPrimary}
                  onClick={handleParse}
                  disabled={!canParse}
                >
                  {stage === "parsing" ? (
                    <span className={styles.parsing}>
                      setting it up…
                    </span>
                  ) : (
                    "Start a payment"
                  )}
                </button>
              )}
              <span className={styles.hint}>⌘↵</span>
            </div>

            {stage === "error" && errors.length > 0 && (
              <div className={styles.inlineErrors}>
                {errors.map((e, i) => (
                  <span key={i} className={styles.errorLine}>✕ {e}</span>
                ))}
              </div>
            )}
          </div>

          {/* Unresolved recipient panel */}
          {stage === "unresolved" && (
            <div className={styles.confirmPanel}>
              <div className={styles.confirmHeader}>
                recipient not found
              </div>
              <p className={styles.confirmBody}>
                {unresolvedName
                  ? <>Couldn't find <strong>{unresolvedName}</strong> in contacts, ENS, or Farcaster. Add them to contacts first, or try a full wallet address.</>
                  : <>Couldn't resolve the recipient. Try a different name or a full wallet address.</>}
              </p>
              <div className={styles.confirmActions}>
                <button className={styles.btnGhost} onClick={handleReset}>← try again</button>
              </div>
            </div>
          )}

          {/* Recipient confirmation panel */}
          {stage === "confirming" && policy && (
            <div className={styles.confirmPanel}>
              <div className={styles.confirmHeader}>
                <span className={styles.confirmIcon}>✦</span>
                confirm recipient
              </div>
              <div className={styles.confirmRecipient}>
                <span className={styles.confirmName}>{policy.recipient_display_name}</span>
                <span className={styles.confirmArrow}>→</span>
                <span className={styles.confirmWallet}>
                  {policy.recipient_wallet.slice(0, 10)}…{policy.recipient_wallet.slice(-8)}
                </span>
                {resolutionSource && resolutionSource !== "direct" && (
                  <span className={styles.sourceTag}>via {SOURCE_LABEL[resolutionSource] ?? resolutionSource}</span>
                )}
              </div>
              <p className={styles.confirmBody}>
                Is this the correct wallet for{" "}
                <strong>{policy.recipient_display_name}</strong>?
              </p>
              <div className={styles.confirmActions}>
                <button className={styles.btnGhost} onClick={handleReset}>
                  wrong address
                </button>
                <button
                  className={styles.btnPrimary}
                  onClick={() => setStage("resolved")}
                >
                  confirmed ▸
                </button>
              </div>
            </div>
          )}
        </div>

        {approveOpen && policy && (
          <ApproveModal
            policy={policy}
            onClose={() => {
              setApproveOpen(false);
              void refreshPolicies();
            }}
          />
        )}

        <div className={styles.previewOuter}>
          <div className={styles.previewChrome}>
            <div className={styles.chromeDots}>
              <span className={`${styles.dot} ${styles.dotRed}`} />
              <span className={`${styles.dot} ${styles.dotYellow}`} />
              <span className={`${styles.dot} ${styles.dotGreen}`} />
            </div>
            <div className={styles.chromeUrl}>
              {stage === "resolved"
                ? `magen://policy/${(previewData.id ?? "").slice(0, 8)}`
                : stage === "confirming"
                ? "magen://policy/ready"
                : "magen://policy/example"}
            </div>
          </div>

          <PolicyCard
            data={previewData}
            isDemo={isDemo}
            confirming={stage === "confirming"}
            enrichment={enrichment}
            onApprove={() => setApproveOpen(true)}
          />
        </div>
        {activePolicies.length > 0 && (
          <div className={styles.policyList}>
            <div className={styles.policyListHeader}>
              active payments
            </div>
            {activePolicies.map((p) => (
              <div key={p.id} className={styles.policyListRow}>
                <div className={styles.policyListMeta}>
                  <span className={styles.policyListName}>{p.recipient_display_name}</span>
                  <span className={styles.policyListAmount}>{p.amount_usdc} USDC</span>
                  <span className={styles.badgeBlue}>{p.frequency}</span>
                </div>
                <div className={styles.policyListRight}>
                  {p.status === "paused" && (
                    <span className={styles.badgePaused}>paused</span>
                  )}
                  <span className={styles.policyListNext}>
                    next run: {fmtNextDate(p.next_execution_at)}
                  </span>
                  <button
                    className={styles.btnCancel}
                    onClick={() => handleCancel(p.id)}
                    title="Cancel policy"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
    <EcosystemSection />
    </>
  );
}

function PolicyCard({
  data,
  isDemo,
  confirming,
  enrichment,
  onApprove,
}: {
  data: PolicyCardData;
  isDemo: boolean;
  confirming?: boolean;
  enrichment?: { onChainContext?: string };
  onApprove?: () => void;
}) {
  const walletShort = `${data.recipient_wallet.slice(0, 10)}…${data.recipient_wallet.slice(-8)}`;
  const startFmt = new Date(data.start_date).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <div className={`${styles.previewBody} ${isDemo ? styles.previewBodyDemo : ""}`}>
      <table className={styles.policyTable}>
        <tbody>
          <tr>
            <td className={styles.pKey}>recipient</td>
            <td className={styles.pVal}>{data.recipient_display_name}</td>
          </tr>
          <tr>
            <td className={styles.pKey}>wallet</td>
            <td className={styles.pVal}>
              <span className={styles.addr}>{walletShort}</span>
            </td>
          </tr>
          <tr>
            <td className={styles.pKey}>amount</td>
            <td className={styles.pVal}>
              <span className={styles.valueGreen}>{data.amount_usdc} USDC</span>
            </td>
          </tr>
          <tr>
            <td className={styles.pKey}>frequency</td>
            <td className={styles.pVal}>
              <span className={styles.badgeBlue}>{data.frequency}</span>
            </td>
          </tr>

          <tr>
            <td className={styles.pKey}>disclosure</td>
            <td className={styles.pVal}>
              <span className={styles.badgeGreen}>encrypted</span>
            </td>
          </tr>
          <tr>
            <td className={styles.pKey}>start</td>
            <td className={styles.pVal}>{startFmt}</td>
          </tr>
          {data.end_date && (
            <tr>
              <td className={styles.pKey}>end</td>
              <td className={styles.pVal}>
                {new Date(data.end_date).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </td>
            </tr>
          )}
          {data.memo && (
            <tr>
              <td className={styles.pKey}>memo</td>
              <td className={styles.pVal}>{data.memo}</td>
            </tr>
          )}
        </tbody>
      </table>

      {enrichment?.onChainContext && (
        <div className={styles.enrichment}>
          <span className={styles.slashDim}>//</span> {enrichment.onChainContext}
        </div>
      )}

      <div className={styles.previewActions}>
        <button
          className={`${styles.btnApprove} ${isDemo || confirming ? styles.btnApproveDemo : ""}`}
          disabled={isDemo || confirming}
          onClick={!isDemo && !confirming ? onApprove : undefined}
        >
          {isDemo
            ? "describe a payment above to continue"
            : confirming
            ? "confirm the recipient above first"
            : "approve & schedule ▸"}
        </button>
        <span className={styles.policyId}>
          id: {isDemo ? "demo" : (data.id ?? "").slice(0, 8)}
        </span>
      </div>
    </div>
  );
}

function Dots() {
  const [n, setN] = useState(1);
  useEffect(() => {
    const t = setInterval(() => setN((x) => (x % 3) + 1), 400);
    return () => clearInterval(t);
  }, []);
  return <span>{".".repeat(n)}</span>;
}
