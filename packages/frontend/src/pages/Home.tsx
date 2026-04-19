import { useState, useRef, useEffect } from "react";
import { api } from "../lib/api.js";
import type { ParseResponse, ParseErrorResponse } from "../lib/api.js";
import type { DisbursementPolicy } from "@magen/shared";
import styles from "./Home.module.css";

const PLACEHOLDER_EXAMPLES = [
  "pay alice.eth 500 USDC every month, auto-approve for 3 months",
  "send 0x1234...5678 a one-time payment of 1000 USDC",
  "pay bob@company.com 250 USDC weekly until I say stop",
];

type Stage = "idle" | "parsing" | "resolved" | "error";

export function Home() {
  const [instruction, setInstruction] = useState("");
  const [stage, setStage] = useState<Stage>("idle");
  const [policy, setPolicy] = useState<DisbursementPolicy | null>(null);
  const [enrichment, setEnrichment] = useState<{ onChainContext?: string }>({});
  const [errors, setErrors] = useState<string[]>([]);
  const [exampleIdx, setExampleIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const t = setInterval(
      () => setExampleIdx((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length),
      3500
    );
    return () => clearInterval(t);
  }, []);

  async function handleParse() {
    if (!instruction.trim()) return;
    setStage("parsing");
    setErrors([]);
    try {
      const res = await api.parseInstruction(instruction);
      setPolicy(res.policy);
      setEnrichment(res.enrichment);
      setStage("resolved");
    } catch (err: unknown) {
      const data = (err as { data?: ParseErrorResponse }).data;
      setErrors(data?.validationErrors ?? ["Unexpected error"]);
      setStage("error");
    }
  }

  function handleReset() {
    setStage("idle");
    setPolicy(null);
    setErrors([]);
    setInstruction("");
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  const canParse = instruction.trim().length > 0 && stage !== "parsing";

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* prompt section */}
        <div className={styles.promptSection}>
          <div className={styles.promptLabel}>
            <span className={styles.slash}>//</span> describe the payment
          </div>

          <div className={styles.inputWrap} data-focused={stage === "idle" || stage === "error"}>
            <span className={styles.prompt}>&gt;</span>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleParse();
              }}
              placeholder={PLACEHOLDER_EXAMPLES[exampleIdx]}
              rows={3}
              disabled={stage === "parsing" || stage === "resolved"}
              autoFocus
            />
            {stage === "idle" && instruction.length === 0 && (
              <span className={styles.cursor} />
            )}
          </div>

          <div className={styles.actions}>
            {stage === "resolved" ? (
              <button className={styles.btnGhost} onClick={handleReset}>
                ← edit
              </button>
            ) : (
              <button
                className={styles.btnPrimary}
                onClick={handleParse}
                disabled={!canParse}
              >
                {stage === "parsing" ? (
                  <span className={styles.parsing}>parsing<Dots /></span>
                ) : (
                  "parse ▸"
                )}
              </button>
            )}
            <span className={styles.hint}>⌘↵ to run</span>
          </div>
        </div>

        {/* divider */}
        {(stage === "resolved" || stage === "error") && (
          <div className={styles.divider}>
            <span>{stage === "resolved" ? "// parsed output" : "// errors"}</span>
          </div>
        )}

        {/* error output */}
        {stage === "error" && (
          <div className={styles.errorBlock} style={{ animation: "fadeUp 0.2s ease" }}>
            {errors.map((e, i) => (
              <div key={i} className={styles.errorLine}>
                <span className={styles.errorTag}>✕</span> {e}
              </div>
            ))}
          </div>
        )}

        {/* policy output */}
        {stage === "resolved" && policy && (
          <PolicyOutput
            policy={policy}
            enrichment={enrichment}
          />
        )}
      </div>
    </div>
  );
}

function PolicyOutput({
  policy,
  enrichment,
}: {
  policy: DisbursementPolicy;
  enrichment: { onChainContext?: string };
}) {
  const rows: [string, string, string?][] = [
    ["recipient", policy.recipient_display_name, "label"],
    ["wallet", `${policy.recipient_wallet.slice(0, 10)}…${policy.recipient_wallet.slice(-8)}`, "addr"],
    ["amount", `${policy.amount_usdc} USDC`, "value"],
    ["frequency", policy.frequency, "badge"],
    ["approval", policy.approval_mode, "badge"],
    ["start", new Date(policy.start_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })],
    ...(policy.end_date ? [["end", new Date(policy.end_date).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })] as [string, string]] : []),
    ...(policy.memo ? [["memo", policy.memo] as [string, string]] : []),
  ];

  return (
    <div className={styles.policyBlock} style={{ animation: "fadeUp 0.25s ease" }}>
      <table className={styles.policyTable}>
        <tbody>
          {rows.map(([key, val, type]) => (
            <tr key={key}>
              <td className={styles.policyKey}>{key}</td>
              <td className={styles.policyVal}>
                {type === "addr" ? (
                  <span className={styles.addr}>{val}</span>
                ) : type === "badge" ? (
                  <span className={styles.badge}>{val}</span>
                ) : type === "value" ? (
                  <span className={styles.valueHighlight}>{val}</span>
                ) : (
                  val
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {enrichment.onChainContext && (
        <div className={styles.enrichment}>
          <span className={styles.slash}>//</span> {enrichment.onChainContext}
        </div>
      )}

      <div className={styles.policyActions}>
        <button className={styles.btnApprove}>
          approve ▸
        </button>
        <span className={styles.policyId}>id: {policy.id.slice(0, 8)}</span>
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
