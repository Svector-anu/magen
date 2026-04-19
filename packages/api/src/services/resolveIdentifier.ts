import { ethers } from "ethers";
import { findByIdentifier, upsertContact } from "../store/contactStore.js";
import type { Contact } from "@magen/shared";

const ENS_PROVIDER = new ethers.JsonRpcProvider(
  "https://ethereum.publicnode.com"
);

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ENS_RE = /\.eth$/i;

export type ResolveOutcome =
  | { status: "found"; contact: Contact }
  | { status: "ens_resolved"; contact: Contact }
  | { status: "address_only"; contact: Contact }
  | { status: "not_found" };

export async function resolveIdentifier(
  identifier: string
): Promise<ResolveOutcome> {
  const trimmed = identifier.trim();

  // 1. Exact match in contact store
  const existing = findByIdentifier(trimmed);
  if (existing) return { status: "found", contact: existing };

  // 2. Raw EVM address — create an unconfirmed contact
  if (EVM_ADDRESS_RE.test(trimmed)) {
    const contact = upsertContact({
      display_name: trimmed.slice(0, 10) + "…",
      aliases: [],
      wallet_address: trimmed,
      resolution_status: "resolved",
    });
    return { status: "address_only", contact };
  }

  // 3. ENS name — attempt on-chain resolution
  if (ENS_RE.test(trimmed)) {
    try {
      const resolved = await ENS_PROVIDER.resolveName(trimmed);
      if (resolved) {
        const contact = upsertContact({
          display_name: trimmed,
          aliases: [],
          ens_name: trimmed,
          wallet_address: resolved,
          resolution_status: "resolved",
        });
        return { status: "ens_resolved", contact };
      }
    } catch {
      // ENS lookup failed — fall through to not_found
    }
  }

  return { status: "not_found" };
}
