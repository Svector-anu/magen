import type { DisbursementPolicy, Contact } from "@magen/shared";

const BASE = (import.meta.env.VITE_API_URL ?? "") + "/api";

// Must stay in sync with SIG_WINDOW_MINUTES on the server (default 5).
// Refresh 1 minute before server would reject it.
export const WALLET_SIG_REFRESH_MINUTES = 4;

export function currentMinute(): number {
  return Math.floor(Date.now() / 60_000);
}

export function walletMessage(action: string, minute: number): string {
  return `magen:${action}:${minute}`;
}

function walletHeaders(address: string, sig: string, minute: number): Record<string, string> {
  return {
    "X-Wallet-Address": address,
    "X-Wallet-Signature": sig,
    "X-Wallet-Timestamp": String(minute),
  };
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Request failed"), { data });
  return data as T;
}

async function postWithWallet<T>(
  path: string,
  body: unknown,
  address: string,
  sig: string,
  minute: number,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...walletHeaders(address, sig, minute) },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Request failed"), { data });
  return data as T;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Request failed"), { data });
  return data as T;
}

async function getWithWallet<T>(path: string, address: string, sig: string, minute: number): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: walletHeaders(address, sig, minute),
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Request failed"), { data });
  return data as T;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Delete failed");
}

async function delWithWallet(path: string, address: string, sig: string, minute: number): Promise<void> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: walletHeaders(address, sig, minute),
  });
  if (!res.ok && res.status !== 204) throw new Error("Delete failed");
}

export interface DashboardPolicy {
  id: string;
  recipient_display_name: string;
  recipient_wallet: string;
  amount_usdc: string;
  frequency: string;
  approval_mode: string;
  status: string;
  next_execution_at: string;
  last_executed_at: string | null;
  created_at: string;
  last_error: string | null;
  last_job_status: string | null;
}

export interface DashboardJob {
  id: string;
  policy_id: string;
  status: string;
  tx_hash: string | null;
  error: string | null;
  created_at: string;
  recipient_display_name: string;
  frequency: string;
}

export interface DashboardData {
  stats: {
    active_policies: number;
    total_policies: number;
    jobs_executed: number;
    jobs_pending: number;
    jobs_failed: number;
    success_rate: number;
  };
  policies: DashboardPolicy[];
  recent_jobs: DashboardJob[];
}

export type RecipientResolutionSource =
  | "direct"
  | "contact"
  | "ens"
  | "farcaster"
  | "farcaster_x"
  | "address_only"
  | null;

export interface ParseResponse {
  policy: DisbursementPolicy;
  enrichment: { onChainContext?: string };
  recipientResolutionSource: RecipientResolutionSource;
}

export interface ParseErrorResponse {
  error: string;
  validationErrors: string[];
  enrichment: object;
  recipientDisplayName?: string;
}

export interface ResolveResult {
  identifier: string;
  status: "found" | "ens_resolved" | "address_only" | "not_found";
  contact?: Contact;
}

export const api = {
  parseInstruction: (instruction: string) =>
    post<ParseResponse>("/parse-instruction", { instruction }),

  resolveRecipients: (identifiers: string[]) =>
    post<{ results: ResolveResult[] }>("/resolve-recipients", { identifiers }),

  listContacts: () => get<Contact[]>("/contacts"),

  upsertContact: (data: Partial<Contact> & { display_name: string }) =>
    post<Contact>("/contacts", data),

  deleteContact: (id: string) => del(`/contacts/${id}`),

  savePolicy: (
    params: { policy: DisbursementPolicy; vaultAddress: string },
    address: string,
    sig: string,
    minute: number,
  ) => postWithWallet<{ policyId: string; jobId: string }>("/policies", params, address, sig, minute),

  listPolicies: (address: string, sig: string, minute: number) =>
    getWithWallet<{
      id: string;
      recipient_display_name: string;
      recipient_wallet: string;
      amount_usdc: string;
      frequency: string;
      next_execution_at: string;
      status: string;
    }[]>("/policies", address, sig, minute),

  cancelPolicy: (id: string, address: string, sig: string, minute: number) =>
    delWithWallet(`/policies/${id}`, address, sig, minute),

  resumePolicy: (id: string, address: string, sig: string, minute: number) =>
    postWithWallet<{ jobId: string }>(`/policies/${id}/resume`, {}, address, sig, minute),

  triggerPolicy: (id: string, address: string, sig: string, minute: number) =>
    postWithWallet<{ jobId: string }>(`/policies/${id}/trigger`, {}, address, sig, minute),

  getJobStatus: (jobId: string) =>
    get<{ id: string; status: string; txHash?: string; error?: string }>(`/jobs/${jobId}`),

  getDashboard: (address: string, sig: string, minute: number) =>
    getWithWallet<DashboardData>("/dashboard", address, sig, minute),
};
