import { currentMinute, WALLET_SIG_REFRESH_MINUTES, walletMessage } from "./api.js";

interface CacheEntry {
  sig: string;
  minute: number;
}

const _cache = new Map<string, CacheEntry>();

function cacheKey(address: string, action: string): string {
  return `${address.toLowerCase()}:${action}`;
}

export function getCached(address: string, action: string): CacheEntry | null {
  const entry = _cache.get(cacheKey(address, action));
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
  _cache.set(cacheKey(address, action), entry);
  return entry;
}

export function invalidate(address: string): void {
  for (const key of _cache.keys()) {
    if (key.startsWith(address.toLowerCase() + ":")) _cache.delete(key);
  }
}
