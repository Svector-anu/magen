import { useState, useEffect, useCallback, useRef } from "react";
import { useAccount, useSignMessage } from "wagmi";
import { api } from "../lib/api.js";
import { getCached, getOrSign } from "../lib/walletAuth.js";
import type { DashboardData } from "../lib/api.js";
import { WrapUsdcModal } from "../components/WrapUsdcModal.js";
import { UnwrapModal } from "../components/UnwrapModal.js";
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

const STATUS_LABEL: Record<string, string> = {
  done: "sent",
  processing: "running",
  expired: "ended",
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

export function Dashboard() {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();

  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [wrapOpen, setWrapOpen] = useState(false);
  const [claimOpen, setClaimOpen] = useState(false);
  const [resuming, setResuming] = useState<string | null>(null);

  // Stable ref so callbacks don't re-create when wagmi identity changes mid-connect
  const signRef = useRef(signMessageAsync);
  useEffect(() => { signRef.current = signMessageAsync; });

  // foreground=true: sign if cache expired (user-initiated action)
  // foreground=false: use cache only — never prompt MetaMask during auto-poll
  const load = useCallback(async (foreground = false) => {
    if (!address) return;

    let auth = getCached(address, "list-policies");
    if (!auth) {
      if (!foreground) return; // skip background poll — don't surprise the user
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
      await load(false);
    } catch {
      // sign rejected or resume failed — leave UI as-is
    } finally {
      setResuming(null);
    }
  }, [address, load]);

  useEffect(() => {
    if (!isConnected) return;
    load(false); // use cached auth only on mount — never auto-prompt
    const id = setInterval(() => load(false), POLL_MS);
    return () => clearInterval(id);
  }, [isConnected, load]);

  if (!isConnected) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>◈</span>
        <p>Connect your wallet to view your dashboard.</p>
      </div>
    );
  }

  if (!data && !loading) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>◈</span>
        <p>Sign once to load your dashboard.</p>
        <button className={styles.signBtn} onClick={() => load(true)}>
          sign &amp; load
        </button>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.topBar}>
        <div className={styles.topBarLeft}>
          <h1 className={styles.title}>Dashboard</h1>
          {lastRefresh && (
            <span className={styles.refreshed}>
              updated {relativeTime(lastRefresh.toISOString())}
            </span>
          )}
        </div>
        <div className={styles.topBarActions}>
          <button className={styles.wrapBtn} onClick={() => setWrapOpen(true)}>
            + wrap usdc
          </button>
          <button className={styles.claimBtn} onClick={() => setClaimOpen(true)}>
            claim cUSDC
          </button>
          <button
            className={styles.refreshBtn}
            onClick={() => load(true)}
            disabled={loading}
          >
            {loading ? "↻ loading…" : "↻ refresh"}
          </button>
        </div>
      </div>
      {wrapOpen && <WrapUsdcModal onClose={() => setWrapOpen(false)} />}
      {claimOpen && <UnwrapModal onClose={() => setClaimOpen(false)} />}

      {error && <div className={styles.errorBar}>{error}</div>}

      {data && (
        <>
          {/* ── Stat cards ── */}
          <div className={styles.statsGrid}>
            <StatCard label="Active"       value={data.stats.active_policies}  />
            <StatCard label="Total"        value={data.stats.total_policies}   />
            <StatCard label="Sent"         value={data.stats.jobs_executed}    accent="green" />
            <StatCard label="Pending"      value={data.stats.jobs_pending}     accent="amber" />
            <StatCard label="Failed"       value={data.stats.jobs_failed}      accent={data.stats.jobs_failed > 0 ? "red" : undefined} />
            <StatCard label="Success rate" value={`${data.stats.success_rate}%`} accent={data.stats.success_rate === 100 ? "green" : undefined} />
          </div>

          {/* ── Policies ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Active Payments</h2>
            {data.policies.length === 0 ? (
              <p className={styles.empty}>No active payments. Start one above.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>To</th>
                      <th>Frequency</th>
                      <th>Status</th>
                      <th>Next Run</th>
                      <th>Last Run</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.policies.map((p) => (
                      <tr key={p.id}>
                        <td className={styles.name}>{p.recipient_display_name}</td>
                        <td className={styles.muted}>{p.frequency}</td>
                        <td><StatusBadge status={p.status} /></td>
                        <td className={styles.mono}>
                          {p.status === "active"
                            ? formatDate(p.next_execution_at)
                            : <span className={styles.muted}>—</span>}
                        </td>
                        <td className={styles.mono}>
                          {p.last_executed_at
                            ? formatDate(p.last_executed_at)
                            : <span className={styles.muted}>never</span>}
                        </td>
                        <td className={styles.mono}>{formatDate(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── Recent executions ── */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Recent Activity</h2>
            {data.recent_jobs.length === 0 ? (
              <p className={styles.empty}>No activity yet.</p>
            ) : (
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>To</th>
                      <th>Frequency</th>
                      <th>Status</th>
                      <th>Tx</th>
                      <th>Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recent_jobs.map((j) => (
                      <tr key={j.id}>
                        <td className={styles.mono} title={j.created_at}>
                          {relativeTime(j.created_at)}
                        </td>
                        <td className={styles.name}>{j.recipient_display_name}</td>
                        <td className={styles.muted}>{j.frequency}</td>
                        <td>
                          <StatusBadge status={j.status} />
                          {j.status === "done" && <span className={styles.privateTag}>· private</span>}
                        </td>
                        <td className={styles.mono}>
                          {j.tx_hash ? (
                            <a
                              href={`${ARBISCAN}${j.tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className={styles.txLink}
                            >
                              {truncate(j.tx_hash)} view ↗
                            </a>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                        <td className={styles.errorCell}>
                          {j.status === "failed" ? (
                            <span className={styles.failedNote}>
                              <span title={j.error ?? undefined}>paused — check your wrapped USDC balance</span>
                              <button
                                className={styles.retryBtn}
                                onClick={() => handleResume(j.policy_id)}
                                disabled={resuming === j.policy_id}
                              >
                                {resuming === j.policy_id ? "resuming…" : "retry ↻"}
                              </button>
                            </span>
                          ) : j.status === "pending" && j.error ? (
                            <span className={styles.muted} title={j.error ?? undefined}>retrying…</span>
                          ) : (
                            <span className={styles.muted}>—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {!data && !error && loading && (
        <div className={styles.loadingState}>Loading…</div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "green" | "amber" | "red";
}) {
  const accentClass =
    accent === "green" ? styles.accentGreen :
    accent === "amber" ? styles.accentAmber :
    accent === "red"   ? styles.accentRed   : "";

  return (
    <div className={`${styles.card} ${accentClass}`}>
      <span className={styles.cardValue}>{value}</span>
      <span className={styles.cardLabel}>{label}</span>
    </div>
  );
}
