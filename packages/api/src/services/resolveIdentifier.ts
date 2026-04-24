import { ethers } from "ethers";
import { findByIdentifier, upsertContact } from "../store/contactStore.js";
import type { Contact } from "@magen/shared";

const ENS_PROVIDER = new ethers.JsonRpcProvider(
  "https://ethereum.publicnode.com"
);

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export type ResolveOutcome =
  | { status: "found"; contact: Contact }
  | { status: "ens_resolved"; contact: Contact }
  | { status: "address_only"; contact: Contact }
  | { status: "not_found" };

async function tryEns(name: string): Promise<string | null> {
  try {
    return await ENS_PROVIDER.resolveName(name);
  } catch {
    return null;
  }
}

export async function resolveIdentifier(
  identifier: string
): Promise<ResolveOutcome> {
  const trimmed = identifier.trim().toLowerCase();

  // 1. Exact match in contact store
  const existing = findByIdentifier(trimmed);
  if (existing) return { status: "found", contact: existing };

  // 2. Raw EVM address
  if (EVM_ADDRESS_RE.test(trimmed)) {
    const contact = upsertContact({
      display_name: trimmed.slice(0, 10) + "…",
      aliases: [],
      wallet_address: trimmed,
      resolution_status: "resolved",
    });
    return { status: "address_only", contact };
  }

  // 3. Strip leading @ (social handles: @alice.eth, @alice)
  const bare = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;

  // 4. Try ENS resolution — dotted name as-is, then bare-name.eth fallback
  const candidates = bare.includes(".") ? [bare, `${bare}.eth`] : [`${bare}.eth`];

  for (const candidate of candidates) {
    const resolved = await tryEns(candidate);
    if (resolved) {
      const contact = upsertContact({
        display_name: bare,
        aliases: trimmed !== bare ? [trimmed] : [],
        ens_name: candidate,
        wallet_address: resolved,
        resolution_status: "resolved",
      });
      return { status: "ens_resolved", contact };
    }
  }

  return { status: "not_found" };
}
