import { Fragment, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useAccount, useSignMessage } from "wagmi";
import { api } from "../lib/api.js";
import { getCached, getOrSign } from "../lib/walletAuth.js";
import type { DashboardData, DashboardJob } from "../lib/api.js";
import { WrapUsdcModal } from "../components/WrapUsdcModal.js";
import { UnwrapModal } from "../components/UnwrapModal.js";
import { useIsOperator, useSetOperator } from "../hooks/useApprove.js";
import styles from "./Dashboard.module.css";

const ARBISCAN = "https://sepolia.arbiscan.io/tx/";
const POLL_MS = 10_000;

function truncate(s: string, n = 8): string {
  return s.slice(0, n) + "…" + s.slice(-6);
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function nextIn(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "overdue";
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `in ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `in ${h}h ${Math.floor(m % 60)}m`;
  return `in ${Math.floor(h / 24)}d`;
}

function initials(name: string): string {
  return name.split(/\s+/).map(w => w[0] ?? "").join("").toUpperCase().slice(0, 2) || "??";
}

function avatarColor(name: string): string {
  const colors = ["#7c3aed", "#2f81f7", "#3fb950", "#f97316", "#ec4899", "#06b6d4"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return colors[Math.abs(h) % colors.length];
}

const STATUS_LABEL: Record<string, string> = {
  done: "executed",
  processing: "running",
  expired: "ended",
  pending: "queued",
};

function displayStatus(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "done" || status === "active" ? styles.badgeGreen :
    status === "pending" || status === "processing" ? styles.badgeAmber :
    status === "failed" ? styles.badgeRed :
    styles.badgeMuted;
  return <span className={`${styles.badge} ${cls}`}>{displayStatus(status)}</span>;
}

function BarChart({ jobs }: { jobs: DashboardJob[] }) {
  const byRecipient = useMemo(() => {
    const map = new Map<string, { done: number; failed: number }>();
    for (const j of jobs) {
      const key = j.recipient_display_name;
      const cur = map.get(key) ?? { done: 0, failed: 0 };
      if (j.status === "done") cur.done++;
      else if (j.status === "failed") cur.failed++;
      map.set(key, cur);
    }
    return [...map.entries()]
      .map(([name, v]) => ({ name, ...v, total: v.done + v.failed }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 6);
  }, [jobs]);

  const maxVal = Math.max(...byRecipient.map(r => r.total), 1);

  if (byRecipient.length === 0) {
    return (
      <div className={styles.chartEmpty}>
        <span className={styles.chartEmptyIcon}>◈</span>
        no executions yet
      </div>
    );
  }

  return (
    <div className={styles.barChart}>
      {byRecipient.map((r) => (
        <div key={r.name} className={styles.barRow}>
          <span className={styles.barLabel}>{r.name}</span>
          <div className={styles.barTrack}>
            <div
              className={styles.barFillDone}
              style={{ width: `${(r.done / maxVal) * 100}%` }}
            />
            {r.failed > 0 && (
              <div
                className={styles.barFillFailed}
                style={{ width: `${(r.failed / maxVal) * 100}%` }}
              />
            )}
          </div>
          <span className={styles.barCount}>{r.total}</span>
        </div>
      ))}
      <div className={styles.barLegend}>
        <span className={styles.legendDot} style={{ background: "#3fb950" }} /> executed
        <span className={styles.legendDot} style={{ background: "#f87171", marginLeft: 12 }} /> failed
      </div>
    </div>
  );
}

function LineChart({ jobs }: { jobs: DashboardJob[] }) {
  const points = useMemo(() => {
    const now = new Date();
    const months: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleString("en-US", { month: "short" });
      const count = jobs.filter(j => j.status === "done" && j.created_at.startsWith(key)).length;
      months.push({ label, count });
    }
    return months;
  }, [jobs]);

  const maxVal = Math.max(...points.map(p => p.count), 1);
  const W = 280;
  const H = 80;
  const pad = 8;
  const xStep = (W - pad * 2) / (points.length - 1);

  const svgPoints = points.map((p, i) => ({
    x: pad + i * xStep,
    y: H - pad - ((p.count / maxVal) * (H - pad * 2)),
    ...p,
  }));

  const polyline = svgPoints.map(p => `${p.x},${p.y}`).join(" ");
  const area = [
    `M ${svgPoints[0].x} ${H}`,
    ...svgPoints.map(p => `L ${p.x} ${p.y}`),
    `L ${svgPoints[svgPoints.length - 1].x} ${H}`,
    "Z",
  ].join(" ");

  return (
    <div className={styles.lineChart}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} className={styles.lineSvg}>
        <defs>
          <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#2f81f7" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2f81f7" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#areaGrad)" />
        <polyline
          points={polyline}
          fill="none"
          stroke="#2f81f7"
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {svgPoints.map((p) => (
          <circle key={p.label} cx={p.x} cy={p.y} r={3} fill="#2f81f7" />
        ))}
      </svg>
      <div className={styles.lineLabels}>
        {points.map(p => (
          <span key={p.label} className={styles.lineLabel}>{p.label}</span>
        ))}
      </div>
    </div>
  );
}

export function Dashboard() {
  const { authenticated } = usePrivy();
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [wrapOpen, setWrapOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [resuming, setResuming] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [revokeConfirm, setRevokeConfirm] = useState(false);

  const { data: isOperator, refetch: refetchOperator } = useIsOperator(address);
  const { setOperator: revokeOperator, isPending: isRevoking, isConfirming: isRevokeConfirming, isSuccess: isRevokeSuccess, reset: resetRevoke } = useSetOperator();

  const signRef = useRef(signMessageAsync);
  useEffect(() => { signRef.current = signMessageAsync; });

  const load = useCallback(async (foreground = false) => {
    if (!address) return;
    let auth = getCached(address, "list-policies");
    if (!auth) {
      if (!foreground) return;
      if (foreground) setLoading(true);
      try {
        auth = await getOrSign(address, "list-policies", (msg) => signRef.current({ message: msg }));
      } catch {
        setError("Signature rejected — click refresh to try again");
        setLoading(false);
        return;
      }
    }
    try {
      const result = await api.getDashboard(address, auth.sig, auth.minute);
      setData(result);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      if (foreground) setError(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      if (foreground) setLoading(false);
    }
  }, [address]);

  const handleResume = useCallback(async (policyId: string) => {
    if (!address) return;
    setResuming(policyId);
    try {
      const auth = await getOrSign(address, "resume-policy", (msg) => signRef.current({ message: msg }));
      await api.resumePolicy(policyId, address, auth.sig, auth.minute);
      await load(true);
    } catch {
      // sign rejected or resume failed
    } finally {
      setResuming(null);
    }
  }, [address, load]);

  const handleTrigger = useCallback(async (policyId: string) => {
    if (!address) return;
    setTriggering(policyId);
    setTriggerError(null);
    try {
      const auth = await getOrSign(address, "trigger-policy", (msg) => signRef.current({ message: msg }));
      await api.triggerPolicy(policyId, address, auth.sig, auth.minute);
      await load(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("already pending") || msg.includes("already running")) {
        setTriggerError("A payment is already queued for this policy — check execution log below.");
      } else if (msg.toLowerCase().includes("reject") || msg.toLowerCase().includes("denied")) {
        // user rejected signature — no banner needed
      } else {
        setTriggerError(msg.slice(0, 120));
      }
      setTimeout(() => setTriggerError(null), 8_000);
    } finally {
      setTriggering(null);
    }
  }, [address, load]);

  const handleCancel = useCallback(async (policyId: string) => {
    if (!address) return;
    setCancelling(policyId);
    try {
      const auth = await getOrSign(address, "cancel-policy", (msg) => signRef.current({ message: msg }));
      await api.cancelPolicy(policyId, address, auth.sig, auth.minute);
      await load(true);
    } catch {
      // sign rejected or cancel failed
    } finally {
      setCancelling(null);
    }
  }, [address, load]);

  useEffect(() => {
    if (!authenticated || !address) return;
    load(false);
    const id = setInterval(() => load(false), POLL_MS);
    return () => clearInterval(id);
  }, [authenticated, address, load]);

  useEffect(() => {
    if (isRevokeSuccess) {
      setRevokeConfirm(false);
      resetRevoke();
      void refetchOperator();
    }
  }, [isRevokeSuccess, resetRevoke, refetchOperator]);

  if (!authenticated) {
    return (
      <div className={styles.gateWrap}>
        <span className={styles.gateIcon}>◈</span>
        <p className={styles.gateText}>Sign in to view your agent dashboard.</p>
      </div>
    );
  }

  if (!data && !loading) {
    return (
      <div className={styles.gateWrap}>
        <span className={styles.gateIcon}>◈</span>
        <p className={styles.gateText}>Sign once to load your agent overview.</p>
        <button className={styles.signBtn} onClick={() => load(true)}>sign &amp; load</button>
      </div>
    );
  }

  const stats = data?.stats;

  return (
    <div className={styles.root}>
      {/* ── Header ── */}
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <div>
            <h1 className={styles.title}>Agent Overview</h1>
            <p className={styles.subtitle}>
              Automate private transfers, execute on schedule, stay in control.
              {lastRefresh && (
                <span className={styles.refreshed}> · updated {relativeTime(lastRefresh.toISOString())}</span>
              )}
            </p>
          </div>
        </div>
        <div className={styles.topBarActions}>
          {isOperator && !revokeConfirm && (
            <button className={styles.revokeBtn} onClick={() => setRevokeConfirm(true)}>
              revoke agent
            </button>
          )}
          {isOperator && revokeConfirm && (
            <div className={styles.revokeConfirmRow}>
              <span className={styles.revokeWarning}>stop all scheduled payments?</span>
              <button
                className={styles.revokeBtnConfirm}
                onClick={() => revokeOperator(0)}
                disabled={isRevoking || isRevokeConfirming}
              >
                {isRevoking || isRevokeConfirming ? "revoking…" : "yes, revoke ▸"}
              </button>
              <button className={styles.revokeBtnCancel} onClick={() => setRevokeConfirm(false)}>cancel</button>
            </div>
          )}
          <button className={styles.actionBtn} onClick={() => setWrapOpen(true)}>+ wrap usdc</button>
          <button className={styles.actionBtnGreen} onClick={() => setClaimOpen(true)}>claim cUSDC</button>
          <button className={styles.refreshBtn} onClick={() => load(true)} disabled={loading}>
            {loading ? "↻ loading…" : "↻ refresh"}
          </button>
        </div>
      </div>

      {wrapOpen && <WrapUsdcModal onClose={() => setWrapOpen(false)} />}
      {claimOpen && <UnwrapModal onClose={() => setClaimOpen(false)} />}
      {error && <div className={styles.errorBar}>{error}</div>}
      {triggerError && <div className={styles.errorBar}>{triggerError}</div>}

      {/* ── Stat cards ── */}
      {stats && (
        <div className={styles.statsGrid}>
          <StatCard
            icon="⬡"
            label="Active Agents"
            value={stats.active_policies}
            sub={`${stats.total_policies} total policies`}
            accent="blue"
          />
          <StatCard
            icon="✦"
            label="Executions Sent"
            value={stats.jobs_executed}
            sub="private on-chain transfers"
            accent="green"
          />
          <StatCard
            icon="◌"
            label="Queued"
            value={stats.jobs_pending}
            sub="waiting to execute"
            accent={stats.jobs_pending > 0 ? "amber" : undefined}
          />
          <StatCard
            icon="✕"
            label="Failed"
            value={stats.jobs_failed}
            sub="check your cUSDC balance"
            accent={stats.jobs_failed > 0 ? "red" : undefined}
          />
          <StatCard
            icon="◎"
            label="Success Rate"
            value={`${stats.success_rate}%`}
            sub="across all executions"
            accent={stats.success_rate === 100 ? "green" : undefined}
          />
          <StatCard
            icon="⬡"
            label="Total Policies"
            value={stats.total_policies}
            sub="all time"
          />
        </div>
      )}

      {/* ── Charts ── */}
      {data && (
        <div className={styles.chartsRow}>
          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <span className={styles.chartTitle}>Disbursements by Recipient</span>
              <span className={styles.chartSub}>execution count · all time</span>
            </div>
            <BarChart jobs={data.recent_jobs} />
          </div>
          <div className={styles.chartCard}>
            <div className={styles.chartHeader}>
              <span className={styles.chartTitle}>Agent Activity</span>
              <span className={styles.chartSub}>private executions · last 6 months</span>
            </div>
            <LineChart jobs={data.recent_jobs} />
          </div>
        </div>
      )}

      {/* ── Active Agents table ── */}
      {data && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Active Payment Agents</span>
            <span className={styles.sectionCount}>{data.policies.length} agents</span>
          </div>
          {data.policies.length === 0 ? (
            <div className={styles.tableEmpty}>No active agents. Start a payment from the home page.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Frequency</th>
                    <th>Status</th>
                    <th>Next Payment</th>
                    <th>Last Run</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.policies.map((p) => (
                    <Fragment key={p.id}>
                      <tr>
                        <td>
                          <div className={styles.recipientCell}>
                            <div
                              className={styles.avatar}
                              style={{ background: avatarColor(p.recipient_display_name) }}
                            >
                              {initials(p.recipient_display_name)}
                            </div>
                            <div className={styles.recipientInfo}>
                              <span className={styles.recipientName}>{p.recipient_display_name}</span>
                              <span className={styles.recipientWallet}>
                                {p.recipient_wallet.slice(0, 8)}…{p.recipient_wallet.slice(-6)}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className={styles.muted}>{p.frequency}</td>
                        <td><StatusBadge status={p.status} /></td>
                        <td>
                          {p.status === "active" ? (
                            <span className={
                              nextIn(p.next_execution_at) === "overdue"
                                ? styles.nextOverdue
                                : styles.nextIn
                            }>
                              {nextIn(p.next_execution_at)}
                            </span>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                        <td className={styles.mono}>
                          {p.last_executed_at ? relativeTime(p.last_executed_at) : <span className={styles.muted}>never</span>}
                        </td>
                        <td>
                          {p.status === "active" && (
                            <button
                              className={styles.triggerBtn}
                              onClick={() => handleTrigger(p.id)}
                              disabled={triggering === p.id}
                              title="Send payment now"
                            >
                              {triggering === p.id ? "sending…" : "send now ▸"}
                            </button>
                          )}
                          {p.status === "paused" && (
                            <div style={{ display: "flex", gap: "6px" }}>
                              <button
                                className={styles.retryBtn}
                                onClick={() => handleResume(p.id)}
                                disabled={resuming === p.id || cancelling === p.id}
                              >
                                {resuming === p.id ? "resuming…" : "↻ resume"}
                              </button>
                              <button
                                className={styles.cancelBtn}
                                onClick={() => handleCancel(p.id)}
                                disabled={cancelling === p.id || resuming === p.id}
                              >
                                {cancelling === p.id ? "cancelling…" : "cancel"}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                      {p.status === "paused" && p.last_error && (
                        <tr className={styles.errorRow}>
                          <td colSpan={6} className={styles.errorRowCell}>
                            <span className={styles.errorRowIcon}>✕</span>
                            {p.last_error.slice(0, 160)}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* ── Execution log ── */}
      {data && (
        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Execution Log</span>
            <span className={styles.sectionCount}>{data.recent_jobs.length} recent</span>
          </div>
          {data.recent_jobs.length === 0 ? (
            <div className={styles.tableEmpty}>No executions yet.</div>
          ) : (
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Recipient</th>
                    <th>Agent Type</th>
                    <th>When</th>
                    <th>Privacy</th>
                    <th>Status</th>
                    <th>Transaction</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent_jobs.map((j) => (
                    <tr key={j.id}>
                      <td>
                        <div className={styles.recipientCell}>
                          <div
                            className={styles.avatar}
                            style={{ background: avatarColor(j.recipient_display_name) }}
                          >
                            {initials(j.recipient_display_name)}
                          </div>
                          <span className={styles.recipientName}>{j.recipient_display_name}</span>
                        </div>
                      </td>
                      <td className={styles.muted}>{j.frequency}</td>
                      <td className={styles.mono} title={j.created_at}>{relativeTime(j.created_at)}</td>
                      <td>
                        <span className={styles.privateTag}>
                          <span className={styles.privacyDot} />
                          encrypted
                        </span>
                      </td>
                      <td>
                        <StatusBadge status={j.status} />
                      </td>
                      <td>
                        {j.tx_hash ? (
                          <a
                            href={`${ARBISCAN}${j.tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className={styles.txLink}
                          >
                            {truncate(j.tx_hash)} ↗
                          </a>
                        ) : (
                          <span className={styles.muted}>—</span>
                        )}
                      </td>
                      <td>
                        {j.status === "failed" && (
                          <button
                            className={styles.retryBtn}
                            onClick={() => handleResume(j.policy_id)}
                            disabled={resuming === j.policy_id}
                          >
                            {resuming === j.policy_id ? "resuming…" : "↻ retry"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {!data && !error && loading && (
        <div className={styles.loadingState}>
          <span className={styles.spinner} /> loading agent data…
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: string;
  label: string;
  value: string | number;
  sub?: string;
  accent?: "green" | "amber" | "red" | "blue";
}) {
  const accentClass =
    accent === "green" ? styles.accentGreen :
    accent === "amber" ? styles.accentAmber :
    accent === "red"   ? styles.accentRed   :
    accent === "blue"  ? styles.accentBlue  : "";

  return (
    <div className={`${styles.card} ${accentClass}`}>
      <div className={styles.cardTop}>
        <span className={styles.cardIcon}>{icon}</span>
        <span className={styles.cardLabel}>{label}</span>
      </div>
      <div className={styles.cardValue}>{value}</div>
      {sub && <div className={styles.cardSub}>{sub}</div>}
    </div>
  );
}
