import { ethers } from "ethers";
import { findByIdentifier, upsertContact } from "../store/contactStore.js";
import type { Contact } from "@magen/shared";

const ENS_PROVIDER = new ethers.JsonRpcProvider(
  "https://ethereum.publicnode.com"
);

const EVM_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;

export type ResolveOutcome =
  | { status: "found"; contact: Contact }
  | { status: "farcaster_resolved"; contact: Contact }
  | { status: "x_resolved"; contact: Contact }
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

function neynarAddress(user: {
  custody_address: string;
  verified_addresses: {
    eth_addresses: string[];
    primary: { eth_address: string | null };
  };
}): string {
  return (
    user.verified_addresses.primary.eth_address ??
    user.verified_addresses.eth_addresses[0] ??
    user.custody_address
  );
}

async function tryFarcasterByUsername(
  username: string
): Promise<{ address: string; displayName: string } | null> {
  const key = process.env.NEYNAR_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(username)}`,
      { headers: { "x-api-key": key } }
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const { user } = (await res.json()) as { user: Parameters<typeof neynarAddress>[0] & { display_name: string } };
    return { address: neynarAddress(user), displayName: user.display_name };
  } catch {
    return null;
  }
}

async function tryFarcasterByX(
  xUsername: string
): Promise<{ address: string; displayName: string } | null> {
  const key = process.env.NEYNAR_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by_x_username?x_username=${encodeURIComponent(xUsername)}`,
      { headers: { "x-api-key": key } }
    );
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const { users } = (await res.json()) as {
      users: (Parameters<typeof neynarAddress>[0] & { display_name: string; score?: number })[];
    };
    if (!users.length) return null;
    const best = users.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    return { address: neynarAddress(best), displayName: best.display_name };
  } catch {
    return null;
  }
}

export async function resolveIdentifier(
  identifier: string
): Promise<ResolveOutcome> {
  const trimmed = identifier.trim().toLowerCase();

  // 1. Exact match in contact store
  const existing = await findByIdentifier(trimmed);
  if (existing) return { status: "found", contact: existing };

  // 2. Raw EVM address
  if (EVM_ADDRESS_RE.test(trimmed)) {
    const contact = await upsertContact({
      display_name: trimmed.slice(0, 10) + "…",
      aliases: [],
      wallet_address: trimmed,
      resolution_status: "resolved",
    });
    return { status: "address_only", contact };
  }

  // 3. Strip leading @
  const bare = trimmed.startsWith("@") ? trimmed.slice(1) : trimmed;

  // 4. Dotted names — ENS resolution only (.eth, .lens handled by TLD)
  if (bare.includes(".")) {
    const candidates = [bare, `${bare}.eth`];
    for (const candidate of candidates) {
      const resolved = await tryEns(candidate);
      if (resolved) {
        const contact = await upsertContact({
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

  // 5. Bare name (no dot) — try Farcaster username, then X cross-ref, then ENS fallback
  const farcaster = await tryFarcasterByUsername(bare);
  if (farcaster) {
    const contact = await upsertContact({
      display_name: farcaster.displayName,
      aliases: trimmed !== bare ? [trimmed] : [],
      wallet_address: farcaster.address,
      resolution_status: "resolved",
    });
    return { status: "farcaster_resolved", contact };
  }

  const xResult = await tryFarcasterByX(bare);
  if (xResult) {
    const contact = await upsertContact({
      display_name: xResult.displayName,
      aliases: trimmed !== bare ? [trimmed] : [],
      wallet_address: xResult.address,
      resolution_status: "resolved",
    });
    return { status: "x_resolved", contact };
  }

  const ensAddress = await tryEns(`${bare}.eth`);
  if (ensAddress) {
    const contact = await upsertContact({
      display_name: bare,
      aliases: trimmed !== bare ? [trimmed] : [],
      ens_name: `${bare}.eth`,
      wallet_address: ensAddress,
      resolution_status: "resolved",
    });
    return { status: "ens_resolved", contact };
  }

  return { status: "not_found" };
}
