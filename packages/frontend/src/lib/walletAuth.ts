import { currentMinute, WALLET_SIG_REFRESH_MINUTES, walletMessage } from "./api.js";

interface CacheEntry {
  sig: string;
  minute: number;
}

const SESSION_PREFIX = "magen_walletauth:";

function cacheKey(address: string, action: string): string {
  return `${address.toLowerCase()}:${action}`;
}

function readSession(key: string): CacheEntry | null {
  try {
    const raw = sessionStorage.getItem(SESSION_PREFIX + key);
    if (!raw) return null;
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return null;
  }
}

function writeSession(key: string, entry: CacheEntry): void {
  try {
    sessionStorage.setItem(SESSION_PREFIX + key, JSON.stringify(entry));
  } catch {
    // sessionStorage unavailable — no-op
  }
}

function deleteSession(prefix: string): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(SESSION_PREFIX + prefix)) sessionStorage.removeItem(k);
    }
  } catch {
    // no-op
  }
}

export function getCached(address: string, action: string): CacheEntry | null {
  const entry = readSession(cacheKey(address, action));
  if (!entry) return null;
  if (currentMinute() - entry.minute >= WALLET_SIG_REFRESH_MINUTES) return null;
  return entry;
}

export async function getOrSign(
  address: string,
  action: string,
  sign: (msg: string) => Promise<string>,
): Promise<CacheEntry> {
  const cached = getCached(address, action);
  if (cached) return cached;
  const minute = currentMinute();
  const sig = await sign(walletMessage(action, minute));
  const entry: CacheEntry = { sig, minute };
  writeSession(cacheKey(address, action), entry);
  return entry;
}

export function invalidate(address: string): void {
  deleteSession(address.toLowerCase() + ":");
}
