# Neynar Social Handle Resolver

Reference for implementing `resolveIdentifier.ts` social resolution paths via Neynar.

---

## Env Var

```
NEYNAR_API_KEY=your_key_here   # get from neynar.com — free tier available
```

Both Neynar paths are **silently skipped** if this key is not set.

---

## MCP Server

```
URL: https://docs.neynar.com/mcp
Transport: HTTP (streamable)
Claude Code CLI: claude mcp add --transport http Neynar https://docs.neynar.com/mcp
VS Code: add to .vscode/mcp.json → { "servers": { "Neynar": { "type": "http", "url": "..." } } }
```

Auth: pass your Neynar API key in the MCP config or `.env`.

---

## Endpoints Used

### 1. Farcaster username → wallet

```
GET https://api.neynar.com/v2/farcaster/user/by_username?username={username}
x-api-key: {NEYNAR_API_KEY}
```

Response shape:
```ts
{
  user: {
    username: string
    display_name: string
    custody_address: string          // always present, FID custody key
    verified_addresses: {
      eth_addresses: string[]        // sorted oldest → newest
      primary: { eth_address: string | null }  // user-chosen primary
    }
  }
}
```

Address to use (priority order):
1. `user.verified_addresses.primary.eth_address` — if not null
2. `user.verified_addresses.eth_addresses[0]` — oldest verified
3. `user.custody_address` — last resort

HTTP 404 = username not found → treat as `not_found`, not an error.

---

### 2. X (Twitter) username → wallet (via Farcaster cross-reference)

```
GET https://api.neynar.com/v2/farcaster/user/by_x_username?x_username={handle}
x-api-key: {NEYNAR_API_KEY}
```

Response shape:
```ts
{
  users: User[]   // same User schema as above, but an ARRAY
}
```

Multiple Farcaster accounts can claim the same X handle.
Disambiguation: sort by `user.score` descending, take `[0]`.

Address extraction: same priority order as endpoint 1.

HTTP 404 = no Farcaster user has verified that X handle → `not_found`.

---

## Resolution Routing Logic

```
input (after trim + lowercase)
│
├─ matches /^0x[0-9a-fA-F]{40}$/ → raw EVM address, store + return
│
├─ strip leading "@" → bare
│
├─ bare ends in ".eth"   → ENS only (ethers.resolveName)
├─ bare ends in ".lens"  → Lens Protocol GraphQL (TODO)
├─ bare contains "."     → try ENS as-is, then bare.eth fallback
│
└─ bare has no dot (plain name or @handle) →
     1. Neynar: by_username(bare)         — Farcaster path
     2. Neynar: by_x_username(bare)       — X/Twitter cross-ref
     3. ENS: resolveName(bare.eth)        — ENS fallback
     4. not_found
```

---

## What Recipients Need

| Input format | Recipient requirement |
|---|---|
| `@farcasteruser` / `farcasteruser` | Farcaster account + at least 1 verified ETH address |
| `@xuser` / `xuser` (X path) | Farcaster account + X username verified on Farcaster |
| `name.eth` | ENS name pointing to their wallet (no social account) |
| `0x...` | Nothing — raw address |

**Key point**: The X lookup does NOT query Twitter. It searches Farcaster users who have linked their X account. Both social paths require the recipient to be on Farcaster.

---

## New `ResolveOutcome` Status Values

Add these to the union type when implementing:

```ts
| { status: "farcaster_resolved"; contact: Contact }
| { status: "x_resolved"; contact: Contact }
```

---

## Error Handling

- `NEYNAR_API_KEY` not set → skip both Neynar calls, fall through to ENS
- HTTP 404 from either endpoint → `not_found` (not thrown)
- HTTP 5xx / network error → log warning, fall through to next strategy
- `users[]` empty on X endpoint → `not_found`
- `users[0].score` absent → fall back to `users[0]` without sorting
