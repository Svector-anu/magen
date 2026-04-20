import type { DisbursementPolicy, Contact } from "@magen/shared";

const BASE = (import.meta.env.VITE_API_URL ?? "") + "/api";

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

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.error ?? "Request failed"), { data });
  return data as T;
}

async function del(path: string): Promise<void> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok && res.status !== 204) throw new Error("Delete failed");
}

export interface ParseResponse {
  policy: DisbursementPolicy;
  enrichment: { onChainContext?: string };
}

export interface ParseErrorResponse {
  error: string;
  validationErrors: string[];
  rawLlmOutput: object;
  enrichment: object;
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

  savePolicy: (params: { policy: DisbursementPolicy; vaultAddress: string }) =>
    post<{ policyId: string; jobId: string }>("/policies", params),

  listPolicies: () =>
    get<{
      id: string;
      recipient_display_name: string;
      recipient_wallet: string;
      amount_usdc: string;
      frequency: string;
      next_execution_at: string;
      status: string;
    }[]>("/policies"),

  cancelPolicy: (id: string) => del(`/policies/${id}`),

  getJobStatus: (jobId: string) =>
    get<{ id: string; status: string; txHash?: string; error?: string }>(`/jobs/${jobId}`),
};
