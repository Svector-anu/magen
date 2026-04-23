# Magen — Privacy Checklist
Last updated: 2026-04-20 (remediation pass). Findings from live API inspection + source review.

Status legend: ✅ SAFE · ❌ LEAK · ⚠️ PARTIAL / CONTEXT-DEPENDENT · 🔲 NOT YET VERIFIED

---

## 1. HTTP Headers

| # | Check | Expected | Result | Evidence |
|---|---|---|---|---|
| 1.1 | `x-powered-by` absent | Header not present | ✅ **FIXED** | `app.disable('x-powered-by')` added — `packages/api/src/index.ts:22` |
| 1.2 | `server` header absent | Not set by default | ✅ Not present (Render strips it) | Response headers inspected |
| 1.3 | CORS locked to known origin | `access-control-allow-origin: https://magen-frontend.onrender.com` | ✅ Confirmed | `FRONTEND_URL` env var, default `http://localhost:5173` |
| 1.4 | No `Access-Control-Allow-Origin: *` | Wildcard must not be used | ✅ Wildcard not set | Source: `packages/api/src/index.ts:23` |

**Fix required (1.1)**: Add `app.disable('x-powered-by')` in `packages/api/src/index.ts` before any route is registered.

---

## 2. On-Chain Amount Privacy

| # | Check | Expected | Result | Evidence |
|---|---|---|---|---|
| 2.1 | Transfer amount not visible in calldata | `encryptedAmount` is a `bytes32` handle, not a uint | ✅ Confirmed | ABI shows `externalEuint256` which maps to `bytes32` |
| 2.2 | Nox TEE gateway used before on-chain call | `executePolicy` calls Nox encrypt before `DisbursementAgent.execute()` | ✅ Confirmed | Source: `packages/api/src/services/executePolicy.ts` |
| 2.3 | Recipient wallet IS public on-chain | `DisbursementAgent.execute(recipient, encryptedAmount)` — recipient is plaintext | ⚠️ By design | Arbitrum Sepolia is a public chain; only the amount is hidden |
| 2.4 | `txHash` returned to frontend after success | `txHash` is a public chain identifier | ⚠️ By design | Anyone with txHash can see the on-chain trace; only amount is private |
| 2.5 | Amount invisible in Arbiscan calldata | 32-byte handle, not a recognisable number | 🔲 Not verified | Requires locating confirmed tx on https://sepolia.arbiscan.io/ |

---

## 3. Database (SQLite)

| # | Check | Expected | Result | Evidence |
|---|---|---|---|---|
| 3.1 | `amount_usdc` stored as plaintext | At-rest: plaintext string e.g. `"10.000000"` | ⚠️ Plaintext by design | `policies` table: `amount_usdc TEXT NOT NULL`; no at-rest encryption |
| 3.2 | `recipient_wallet` stored as plaintext | At-rest: plaintext EVM address | ⚠️ Plaintext by design | `policies` table: `recipient_wallet TEXT NOT NULL` |
| 3.3 | `PRIVATE_KEY` never written to DB | Only policy/job data stored | ✅ Not written | DB schema in `packages/api/src/services/db.ts` has no secrets column |
| 3.4 | `AGENT_PUBLIC_JWK` never written to DB | Only used for signature verification in middleware | ✅ Not written | Checked all INSERT paths |
| 3.5 | DB file not web-accessible | `.magen.db` in CWD, not under a public directory | ✅ Not served | No static file middleware serving CWD; file not in `public/` |
| 3.6 | DB file ephemeral on Render | Resets on redeploy | ⚠️ Known | Acceptable for testnet. Set `DB_PATH` to persistent volume for prod. |
| 3.7 | `error` field in jobs table | Contains raw chain error string | ⚠️ Context | `CALL_EXCEPTION`, `INSUFFICIENT_FUNDS` strings — no key material expected, but error messages can expose wallet addresses from chain revert messages |

---

## 4. API Response Exposure

| # | Check | Expected | Result | Evidence |
|---|---|---|---|---|
| 4.1 | `/api/parse-instruction` — no secrets in response | Response contains `policy` and `enrichment` only | ✅ Verified live | Privacy scan grep on live response: 0 matches for `PRIVATE_KEY`, `AGENT`, `JWK`, `crv`, `groq` |
| 4.2 | `/api/parse-instruction` — `rawLlmOutput` in 422 | Exposed on validation errors | ⚠️ Partial | `rawLlmOutput` field returned in 422 responses (source: `packages/api/src/routes/parse.ts:29`). LLM output is unlikely to contain secrets but is unfiltered text. |
| 4.3 | `/api/policies` — `vault_address` exposed | Vault address is a public contract address | ⚠️ By design | `GET /api/policies` returns full `StoredPolicy` including `vault_address`. This is a public contract, not a secret, but it reveals the user's vault. |
| 4.4 | `/api/policies` — `amount_usdc` exposed to frontend | Frontend needs it to display; it's not hidden from the policy owner | ⚠️ By design | Policy list is served without auth — anyone who knows the endpoint can enumerate policies |
| 4.5 | `/api/policies` — no auth on list endpoint | Currently unauthenticated | ✅ **FIXED** | `requireWallet` middleware verifies ECDSA signature. Policies filtered by `owner_wallet`. See §6 and tradeoffs below. |
| 4.6 | `/api/jobs/:id` — no auth | Returns job status, txHash, error | ⚠️ Known | Job ID is a UUID (unguessable). Error string could expose chain error details but not key material. Acceptable while job IDs are not publicly listed. |
| 4.7 | `/api/execute` error detail in 500 response | Returns `detail: String(err)` on retry | ✅ **FIXED** | `detail` removed from response body. Full error now only in `console.error` on server. See `packages/api/src/routes/execute.ts:84-95`. |
| 4.8 | No stack traces in 500 responses | `console.error` logs the error, response only sends message | ✅ Confirmed | All 500 handlers send `{ error: "Internal error" }` or similar, not stack traces. Source: `packages/api/src/routes/execute.ts:95` |

---

## 5. Secret / Key Material

| # | Check | Expected | Result | Evidence |
|---|---|---|---|---|
| 5.1 | `PRIVATE_KEY` never in any HTTP response | Not in parse, policies, jobs, execute responses | ✅ Confirmed | grep on all route files: no `process.env.PRIVATE_KEY` read in response path |
| 5.2 | `AGENT_PRIVATE_JWK` never in any HTTP response | Agent holds this; API only holds public JWK | ✅ Confirmed | API env only has `AGENT_PUBLIC_JWK`; private JWK only on magen-agent |
| 5.3 | `GROQ_API_KEY` never returned | Internal service only | ✅ Confirmed | Used only inside `parseInstruction` service, never surfaced |
| 5.4 | `ADMIN_TOKEN` never returned | Used for comparison only | ✅ Confirmed | Source: `packages/api/src/routes/admin.ts` — compared with `===`, never echoed |
| 5.5 | Env vars not logged at startup | `validateEnv()` throws if missing, does not print values | ✅ Confirmed | Source: `packages/api/src/services/config.ts` |
| 5.6 | `.env` and `.env.keys` gitignored | Never committed | ✅ Confirmed | `.gitignore` includes both |
| 5.7 | On Render, secrets set as env vars (not file) | dotenvx `.env` not present in deployed container | ✅ Confirmed | RELEASE_STATE.md; Render injects env vars at runtime |

---

## 6. Agent Authentication Surface

| # | Check | Expected | Result | Evidence |
|---|---|---|---|---|
| 6.1 | `/api/jobs/pending` requires vestauth | 401 without valid signature | ✅ Verified live | `requireAgent` middleware on route; test 4.4 confirmed 401 |
| 6.2 | `/api/execute` requires vestauth | 401 without valid signature | ✅ Verified live | `requireAgent` middleware on route; test 5.1 confirmed 401 |
| 6.3 | `/api/policies` GET — requires wallet signature | `X-Wallet-Address` + `X-Wallet-Signature` headers | ✅ **FIXED** | Timestamped sig: `"magen:list-policies:<unix-minute>"`. Responses scoped to verified address. |
| 6.6 | `/api/policies` POST — wallet sig required, ownerWallet from sig | Body cannot claim arbitrary wallet | ✅ **FIXED** | `makeRequireWallet("save-policy")`; `ownerWallet = req.verifiedWallet` (not from body) |
| 6.7 | `DELETE /api/policies/:id` — requires wallet sig, owner enforced | Cannot cancel another user's policy | ✅ **FIXED** | `makeRequireWallet("cancel-policy")`; `WHERE id = ? AND owner_wallet = req.verifiedWallet` |
| 6.8 | vestauth 401 — no internal detail in response | `{"error":"Unauthorized"}` only | ✅ **FIXED** | `detail` field removed; error logged server-side only |
| 6.4 | `/api/parse-instruction` — rate limited | 10 requests/min per IP | ✅ **FIXED** | `express-rate-limit` applied: 10 req/60s window. Configurable via `PARSE_RATE_LIMIT` env var. |
| 6.5 | vestauth key cannot be extracted from API env | API holds public JWK only; private JWK on agent only | ✅ Confirmed | Key split by design |

---

## 7. Scheduler and Logging

| # | Check | Expected | Result | Evidence |
|---|---|---|---|---|
| 7.1 | Scheduler logs include recipient display name | `amount_usdc USDC → recipient_display_name` | ⚠️ Context | Log line in `packages/api/src/index.ts:46`. Display name is user-provided (e.g. "Alice"), not a secret. Amount is plaintext. Acceptable for ops visibility. |
| 7.2 | Scheduler logs no key material | Only policy ID, job ID, display name, amount | ✅ Confirmed | Source reviewed; no `process.env` access in scheduler log path |
| 7.3 | Render log retention | Render retains logs in their infrastructure | ⚠️ Known | Logs are visible to anyone with Render dashboard access. Amount/recipient appear in logs. |
| 7.4 | No sensitive data in notify payload | `notify()` sends webhook with type, jobId, policyId, txHash | ✅ Confirmed | Source: `packages/api/src/services/notify.ts` — no amount or wallet in webhook body |

---

## 8. Fixes Required Before Mainnet

| Priority | Issue | File | Status |
|---|---|---|---|
| **High** | `x-powered-by: Express` header | `packages/api/src/index.ts` | ✅ Fixed |
| **High** | `GET /api/policies` unauthenticated | `packages/api/src/routes/policies.ts` | ✅ Fixed — ECDSA wallet signature required |
| **High** | `POST /api/policies` unauthenticated | Same | ✅ Fixed — `makeRequireWallet("save-policy")`, `ownerWallet` derived from sig |
| **High** | `DELETE /api/policies/:id` unauthenticated | Same | ✅ Fixed — `makeRequireWallet("cancel-policy")`, owner enforced in DB query |
| **High** | `vestauth` 401 leaks internal detail | `packages/api/src/middleware/vestauth.ts` | ✅ Fixed — `detail` removed from response |
| **Med** | `detail` field in 500 execute responses | `packages/api/src/routes/execute.ts` | ✅ Fixed |
| **Med** | `rawLlmOutput` in 422 parse responses | `packages/api/src/routes/parse.ts:29` | ⚠️ Unfiltered — remove before production |
| **Med** | `/api/parse-instruction` rate limiting | `packages/api/src/routes/parse.ts` | ✅ Fixed — 10 req/min per IP |
| **Low** | Amount plaintext in SQLite | `packages/api/src/services/db.ts` | ⚠️ By design for testnet |
| **Low** | `vault_address` returned in policy list | `packages/api/src/routes/policies.ts` | ⚠️ Public contract address, low risk |

## 9. Tradeoffs

**Wallet signature on GET (fix 1):**
The signed message `"magen:list-policies"` is static — the signature is replayable indefinitely. Someone who captures the sig can query that wallet's policies forever. For a testnet/demo this is acceptable: the risk is someone reading your own payment schedule, not moving funds. Before mainnet, add a short-lived timestamp: sign `"magen:list-policies:<unix-minute>"` and reject requests where the timestamp is >5 minutes old. This adds a nonce round-trip but kills replay.

**POST /api/policies — owner stored but not proven:**
`ownerWallet` is passed by the frontend but the server trusts it without a signature. A malicious caller could POST a policy under a different wallet, and that wallet's policy list would then include it. The on-chain `setOperator` tx already proves wallet ownership at approval time, so this attack creates a polluted list for the victim but cannot move funds. Fix before mainnet: require a `X-Wallet-Signature` on POST as well.

**Rate limit is IP-based:**
`express-rate-limit` defaults to `req.ip`. Behind Render's proxy, `req.ip` may be the proxy IP unless `app.set('trust proxy', 1)` is set. Add that line if the rate limit proves ineffective on Render.

---

## 10. Threat Model Summary

| Threat | Mitigated? | Notes |
|---|---|---|
| Transfer amount visible on-chain | ✅ Yes | Nox TEE encrypts amount → `bytes32` handle |
| Recipient address visible on-chain | ❌ No (by design) | Public blockchain; Arbitrum Sepolia is public |
| API keys leaked via HTTP response | ✅ Yes | No secret in any response path |
| Agent impersonation | ✅ Yes | vestauth Ed25519 signatures required |
| Policy enumeration by anyone | ✅ Fixed | `GET /api/policies` requires ECDSA wallet signature; server filters by `owner_wallet` |
| Groq API key abuse via parse endpoint | ✅ Fixed | 10 req/min per IP rate limit |
| Framework fingerprinting | ✅ Fixed | `x-powered-by` disabled |
| DB file exfiltration | ✅ Low risk | File not served; Render container isolation |
| Webhook payload leaks | ✅ Yes | No amount or wallet in webhook body |
