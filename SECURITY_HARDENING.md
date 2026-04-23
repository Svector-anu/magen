# Magen — Security Hardening
Completed: 2026-04-23. Six targeted fixes following the PRIVACY_CHECKLIST.md remediation pass.

---

## What Changed

### 1. Timestamped, expiring wallet signatures (GET /api/policies)

**Before**: `GET /api/policies` required a signature over the static string `"magen:list-policies"`.  
A captured signature worked forever — any attacker who intercepted a request could enumerate that wallet's policies indefinitely.

**After**: signature is over `"magen:list-policies:<unix-minute>"`.  
The server accepts signatures where `|serverMinute − requestMinute| ≤ SIG_WINDOW_MINUTES` (default: 5).  
After 5 minutes, the same sig is rejected as expired.

**File changed**: `packages/api/src/middleware/requireWallet.ts`

```diff
-export const WALLET_MESSAGE = "magen:list-policies";
+export const SIG_WINDOW_MINUTES = Number(process.env.SIG_WINDOW_MINUTES ?? 5);

-export async function requireWallet(req, res, next) {
+export function makeRequireWallet(action: string) {
+  return async function requireWalletMiddleware(req, res, next) {
     ...
+    const minute = Number(rawTs);
+    if (!isValidMinute(minute)) {
+      res.status(401).json({ error: "Signature expired or invalid timestamp" });
+      return;
+    }
+    const message = `magen:${action}:${minute}`;
     const recovered = verifyMessage(message, rawSig);
     ...
+  };
 }
```

---

### 2. Wallet signature required for POST /api/policies

**Before**: `POST /api/policies` accepted `ownerWallet` directly from the request body.  
Any caller could claim any wallet as the owner, polluting another user's policy list.

**After**: `POST /api/policies` now requires the same `X-Wallet-Address` / `X-Wallet-Signature` / `X-Wallet-Timestamp` headers, signed over `"magen:save-policy:<unix-minute>"`. The server derives `ownerWallet` from the verified signature — the body no longer has an `ownerWallet` field.

**Files changed**:
- `packages/api/src/middleware/requireWallet.ts` — factory `makeRequireWallet(action)` produces per-endpoint middleware
- `packages/api/src/routes/policies.ts` — POST uses `makeRequireWallet("save-policy")`, `ownerWallet = req.verifiedWallet`
- `packages/frontend/src/components/ApproveModal.tsx` — signs `"magen:save-policy:<minute>"` after the setOperator tx confirms, before calling `savePolicy`

```diff
 // packages/api/src/routes/policies.ts
-policiesRouter.post("/policies", (req, res) => {
+policiesRouter.post("/policies", makeRequireWallet("save-policy"), (req, res) => {
   const body = CreateSchema.safeParse(req.body);
   ...
-  const stored = createPolicy(body.data.policy, body.data.vaultAddress, body.data.ownerWallet);
+  const stored = createPolicy(body.data.policy, body.data.vaultAddress, req.verifiedWallet!);
```

**Cross-endpoint replay is blocked**: the action prefix (`list-policies` vs `save-policy`) is part of the signed message. A GET signature cannot be replayed for a POST, and vice versa. Proven by tests in `security.test.ts`.

---

### 3. Express trust proxy for accurate rate-limit IPs

**Before**: `app.set("trust proxy", ...)` was not set.  
Behind Render's reverse proxy, `req.ip` resolved to the proxy's IP, making `express-rate-limit`'s per-IP counting ineffective — every user appeared to be the same IP.

**After**: `app.set("trust proxy", 1)` added in `packages/api/src/index.ts`.  
Express now reads `X-Forwarded-For` (set by Render's proxy) and resolves `req.ip` to the real client IP. The rate limiter counts per real client.

```diff
 const app = express();
 app.disable("x-powered-by");
+app.set("trust proxy", 1);
```

---

### 4. DELETE /api/policies/:id — authenticated cancel

**Before**: `DELETE /api/policies/:id` required no auth. Anyone who knew a policy UUID could cancel it.

**After**: DELETE now requires `makeRequireWallet("cancel-policy")`. The server validates the signature and enforces `WHERE id = ? AND owner_wallet = ?` — a user can only cancel their own policies.

```diff
 // packages/api/src/routes/policies.ts
-policiesRouter.delete("/policies/:id", (req, res) => {
-  const cancelled = cancelPolicy(req.params.id);
+policiesRouter.delete("/policies/:id", makeRequireWallet("cancel-policy"), (req, res) => {
+  const cancelled = cancelPolicy(req.params.id, req.verifiedWallet!);
```

```diff
 // packages/api/src/services/policyStore.ts
-export function cancelPolicy(id: string): boolean {
-  ...WHERE id = ? AND status = 'active'...
+export function cancelPolicy(id: string, ownerWallet: string): boolean {
+  ...WHERE id = ? AND owner_wallet = ? AND status = 'active'...
```

---

### 5. Silent zero transfer detection (ERC-7984)

**Before**: `DisbursementVault.executeDisbursement()` calls `wrappedUsdc.confidentialTransferFrom()`, which internally uses `safeSub`. Under ERC-7984, `safeSub` never reverts — if the vault has insufficient balance it silently transfers 0. The API had no way to detect this: the on-chain tx succeeded, the job was marked `done`, and the recipient received nothing.

**After**: Three-layer fix:

1. **`DisbursementVault.sol`** — after the transfer, grants `DisbursementAgent` ACL access to the transferred handle so the agent can forward access upstream.
2. **`DisbursementAgent.sol`** — captures the returned `euint256 transferred` handle, grants `owner` (API wallet) decrypt access via `Nox.allow(transferred, owner)`, and emits the handle as `bytes32` in `ExecutionRouted`.
3. **`executePolicy.ts`** — after `tx.wait()`, parses the `ExecutionRouted` log, decrypts the handle via `@iexec-nox/handle`, and throws `"Silent zero transfer"` if the decrypted value is `0n`.

```diff
 // DisbursementVault.sol
 euint256 transferred = wrappedUsdc.confidentialTransferFrom(payer, recipient, encryptedAmount, inputProof);
 Nox.allowThis(transferred);
+Nox.allow(transferred, agent);

 // DisbursementAgent.sol
+euint256 transferred = DisbursementVault(vault).executeDisbursement(...);
+Nox.allowThis(transferred);
+Nox.allow(transferred, owner);
+emit ExecutionRouted(vault, policyId, euint256.unwrap(transferred));

 // executePolicy.ts
+const routedLog = receipt.logs
+  .map(log => { try { return AGENT_IFACE.parseLog(log); } catch { return null; } })
+  .find(parsed => parsed?.name === "ExecutionRouted");
+if (routedLog) {
+  const { value } = await noxClient.decrypt(transferredHandle);
+  if (value === 0n) throw new Error("Silent zero transfer — vault has insufficient wrapped USDC balance");
+}
```

**Note**: decrypt failure due to NOX gateway unavailability is logged but not thrown — the transfer itself succeeded. Only an explicit `0n` result is fatal.

---

### 6. vestauth middleware — internal detail removed from 401

**Before**: vestauth rejection sent `{ error: "Unauthorized", detail: "<internal error string>" }` — exposing the internal vestauth error message (e.g. `[MISSING_SIGNATURE_INPUT]`) to callers.

**After**: error is logged server-side only. Response is `{ error: "Unauthorized" }`.

```diff
 // packages/api/src/middleware/vestauth.ts
+  console.error("[vestauth] reject:", err instanceof Error ? err.message : String(err));
-  res.status(401).json({ error: "Unauthorized", detail: err instanceof Error ? err.message : String(err) });
+  res.status(401).json({ error: "Unauthorized" });
```

---

## Auth Flow After All Changes

```
Browser                        magen-api
──────                         ─────────

1. User connects wallet
2. Sign "magen:list-policies:<minute>"  →  GET /api/policies
   Headers:                               requireWallet("list-policies")
     X-Wallet-Address: 0x...               ├─ check X-Wallet-Timestamp within ±5 min
     X-Wallet-Signature: 0x...             ├─ reconstruct "magen:list-policies:<minute>"
     X-Wallet-Timestamp: <minute>          ├─ ethers.verifyMessage(message, sig)
                                           ├─ recovered === claimed address?
                                           └─ filter policies WHERE owner_wallet = verified

3. On-chain setOperator tx confirms
4. Sign "magen:save-policy:<minute>"   →  POST /api/policies
   Headers: (same format)                  requireWallet("save-policy")
   Body: { policy, vaultAddress }           ├─ verify sig over "magen:save-policy:<minute>"
                                            └─ ownerWallet = req.verifiedWallet (from sig)
                                               (NOT from body)

5. Cancel policy
   Sign "magen:cancel-policy:<minute>"  →  DELETE /api/policies/:id
   Headers: (same format)                  requireWallet("cancel-policy")
                                           ├─ verify sig over "magen:cancel-policy:<minute>"
                                           └─ WHERE id = ? AND owner_wallet = req.verifiedWallet

6. Agent (server-side, Ed25519/vestauth)
                                       →  GET /api/jobs/pending
                                       →  POST /api/execute
                                           requireAgent (vestauth Ed25519)
                                           → 401 { error: "Unauthorized" } (no detail leaked)
```

**Key property**: a signature for one action cannot be used against another endpoint. The server independently constructs the expected message using:
- The action it knows (baked into `makeRequireWallet("list-policies")` vs `makeRequireWallet("save-policy")`)
- The timestamp the client provided (validated to be within the window)
- Concatenated: `"magen:<action>:<minute>"`

The client cannot forge the action component because it doesn't control what string the server uses.

---

## Test Coverage

File: `packages/api/src/__tests__/security.test.ts` — 15 tests, all passing.

| Test | Proves |
|---|---|
| No headers → 401 | Unauthenticated requests blocked |
| Only address header → 401 | Old 2-header format (pre-hardening) rejected |
| Static sig, no timestamp → 401 | Old attack format (pre-remediation) rejected |
| Expired timestamp → 401 | Replay after >5 min window rejected |
| Future timestamp → 401 | Clock skew attack rejected |
| Timestamp at edge of window → 200 | Legitimate clock skew accepted |
| Wrong signer → 401 | Impersonation attempt rejected |
| `list-policies` sig vs `save-policy` endpoint → 401 | Cross-endpoint replay rejected |
| `save-policy` sig vs `list-policies` endpoint → 401 | Cross-endpoint replay rejected (reverse) |
| `cancel-policy` sig vs `list-policies` endpoint → 401 | Cross-endpoint replay rejected (cancel→list) |
| Valid current-minute sig → 200 | Legitimate auth accepted |
| 503 response has no `detail`/`stack` | Internal error details not leaked |
| 401 response has no `detail`/`stack` | Same |
| Rate limit returns JSON | Rate limit response is machine-readable |
| trust proxy = 1 is set | Real client IPs used for rate limiting |

---

## Remaining Gaps (pre-mainnet)

| Issue | Risk | Fix |
|---|---|---|
| GET sig is valid for 5 min (replayable within window) | Captured sig usable for <5 min. Time-of-capture is the attack window. | Acceptable for testnet. For mainnet: reduce `SIG_WINDOW_MINUTES` to 2 and add HTTPS-only enforcement. |
| `POST /api/policies` — `ownerWallet` tied to sig, but vault ownership unproven | A user could sign a valid sig but set an arbitrary `vaultAddress`. The on-chain `setOperator` tx is the real vault authorization. | No additional risk — vault ownership is enforced on-chain, not here. |
| ~~Silent zero transfer (ERC-7984)~~ | ~~`safeSub` never reverts on insufficient balance — transfers 0 silently.~~ | **Fixed** — see §5. Contracts + API updated. Requires redeploy of `DisbursementAgent` and `DisbursementVault`. |
