# Magen — Test Plan
Validation phase. Every result below was produced by a live test against https://magen-api.onrender.com on 2026-04-20.

Status legend: ✅ PASS · ❌ FAIL · ⚠️ PASS WITH NOTE · 🔲 NOT YET TESTED

---

## 1. Infrastructure

| # | Test | Expected | Result |
|---|---|---|---|
| 1.1 | `GET /health` | `{"ok":true}` 200 | ✅ `{"ok":true}` |
| 1.2 | Unknown route | 404 | ✅ 404 |
| 1.3 | API reachable from frontend origin | CORS allows `magen-frontend.onrender.com` | ✅ `access-control-allow-origin: https://magen-frontend.onrender.com` |
| 1.4 | API reachable from foreign origin | Response delivered but CORS header set to whitelist only (browser enforces) | ✅ Status 200, CORS header = frontend origin (browser will block evil.com) |

---

## 2. Parse Instruction

| # | Test | Expected | Result |
|---|---|---|---|
| 2.1 | Valid instruction with address | Returns `policy` object with correct fields | ✅ `{"policy":{...},"enrichment":{}}` |
| 2.2 | Empty instruction | 400 with validation error | ✅ `"String must contain at least 1 character(s)"` |
| 2.3 | Missing `instruction` field | 400 with required error | ✅ `"Required"` |
| 2.4 | Response contains no secrets | No `PRIVATE_KEY`, `AGENT`, `JWK` in response | ✅ 0 matches |
| 2.5 | ENS name in instruction | 🔲 Not tested — requires ENS resolution |
| 2.6 | Ambiguous instruction (no amount) | 🔲 Not tested — depends on LLM behaviour |

---

## 3. Policy Lifecycle

| # | Test | Expected | Result |
|---|---|---|---|
| 3.1 | `POST /api/policies` valid | 201 with `policyId` and `jobId` | ✅ `{"policyId":"...","jobId":"..."}` |
| 3.2 | `POST /api/policies` bad wallet | 400 with EVM address error | ✅ `"Must be a valid EVM address"` |
| 3.3 | `GET /api/policies` after create | Returns policy row | ✅ Full row returned |
| 3.4 | `GET /api/policies` after cancel | Cancelled policy absent | ✅ Empty after cancel (status='cancelled' excluded) |
| 3.5 | `DELETE /api/policies/:id` active | 204 | ✅ 204 |
| 3.6 | `DELETE /api/policies/:id` already cancelled | 404 | ✅ `"Policy not found or already inactive"` |
| 3.7 | `DELETE /api/policies/:id` nonexistent | 404 | ✅ `"Policy not found or already inactive"` |
| 3.8 | Policy with `end_date` set | 🔲 Not tested — check scheduler respects it |
| 3.9 | Policy with `approval_period_end` set | 🔲 Not tested — check scheduler respects it |
| 3.10 | `frequency=once` policy expires after execution | 🔲 Need to observe post-execution status |

---

## 4. Job Lifecycle

| # | Test | Expected | Result |
|---|---|---|---|
| 4.1 | Job created on policy save | `status: "pending"`, `attempt: 0` | ✅ `{"status":"pending","txHash":null,"error":null}` |
| 4.2 | `GET /api/jobs/:id` valid | Returns job fields | ✅ |
| 4.3 | `GET /api/jobs/:id` nonexistent | 404 | ✅ `"Job not found"` |
| 4.4 | Agent polling `GET /api/jobs/pending` without auth | 401 | ✅ `"Unauthorized"` |
| 4.5 | Job transitions: pending → processing → done | 🔲 Requires agent flow observation |
| 4.6 | Job retry on transient error | 🔲 Requires injecting a failing job |
| 4.7 | Job fails after 3 attempts → policy paused | 🔲 Requires injecting persistent failure |

---

## 5. Execution Path (On-Chain)

| # | Test | Expected | Result |
|---|---|---|---|
| 5.1 | `POST /api/execute` without agent auth | 401 | ✅ `"[MISSING_SIGNATURE_INPUT]"` |
| 5.2 | `POST /api/execute` with bad `jobId` format | 400 | ⚠️ Returns 401 — auth gate fires before body validation (expected; body validation would give 400 with valid agent creds) |
| 5.3 | `POST /api/execute` with nonexistent jobId | 404 | 🔲 Blocked — requires valid vestauth agent creds to reach body validation |
| 5.4 | Full execution: policy → job → agent → txHash | Returns `txHash` | ✅ Confirmed in prior session (tx `0x17f489b5...`) |
| 5.5 | Amount encrypted via Nox before on-chain call | `encryptedAmount` is `bytes32` handle, not uint256 | ✅ ABI confirmed `externalEuint256` / `bytes32` |
| 5.6 | Transfer amount NOT visible on-chain | Verify on Arbiscan that calldata has no plaintext amount | 🔲 Needs Arbiscan inspection of confirmed tx |

---

## 6. Agent Authentication

| # | Test | Expected | Result |
|---|---|---|---|
| 6.1 | Unsigned request to `/execute` | 401 | ✅ |
| 6.2 | Unsigned request to `/jobs/pending` | 401 | ✅ |
| 6.3 | Wrong signature | 401 | ✅ `{"error":"Unauthorized"}` — no `detail` field (fixed in this pass) |
| 6.4 | Valid vestauth signature accepted | 200 | 🔲 Requires agent keypair to sign test request |
| 6.5 | `AGENT_PUBLIC_JWK` missing | 500 with config error | 🔲 Not tested (would require removing env var) |

---

## 7. Global Pause

| # | Test | Expected | Result |
|---|---|---|---|
| 7.1 | `POST /api/admin/pause` without `ADMIN_TOKEN` set | 503 `"Admin endpoints disabled"` | ✅ |
| 7.2 | `POST /api/admin/pause` with wrong token | 401 | 🔲 Requires `ADMIN_TOKEN` to be set first |
| 7.3 | `POST /api/admin/pause` with correct token | 200, `paused: true` | 🔲 Requires `ADMIN_TOKEN` |
| 7.4 | Execute job while paused | 503 `"Execution paused"` | 🔲 Requires pause to be active |
| 7.5 | `POST /api/admin/resume` restores execution | Jobs process again | 🔲 Requires pause + resume sequence |

---

## 8. Edge Cases

| # | Test | Expected | Result |
|---|---|---|---|
| 8.1 | Duplicate policy ID | 🔲 SQLite PRIMARY KEY constraint — should 500 or 409 |
| 8.2 | Amount with 0 decimals (`"10"`) | 🔲 `usdcToAtomic` handles missing decimal point |
| 8.3 | Amount with >6 decimals | 🔲 `usdcToAtomic` truncates at 6 |
| 8.4 | Very large amount | 🔲 BigInt overflow check |
| 8.5 | Scheduler fires when no due policies | No jobs created, no error | 🔲 Confirm via logs |
| 8.6 | Execution cap: >3 executions in 1 hour | 4th job not queued | 🔲 Requires time manipulation |

---

## 9. UI States (magen-frontend.onrender.com)

| # | Test | Expected | Result |
|---|---|---|---|
| 9.1 | Idle state loads | Placeholder text cycles, parse button active | 🔲 |
| 9.2 | Parse with valid instruction | Policy card appears | 🔲 |
| 9.3 | Parse with invalid instruction | Error message shown | 🔲 |
| 9.4 | Approve modal opens | Shows recipient, amount, frequency | 🔲 |
| 9.5 | Wallet not connected — approve | Prompts wallet connect | 🔲 |
| 9.6 | Active policy list shows after approve | Policy appears with next date | 🔲 |
| 9.7 | Cancel policy | Policy disappears from list | 🔲 |
| 9.8 | Paused policy shows amber badge | Amber "paused" badge visible | 🔲 |
| 9.9 | Next date shows year for distant policies | "May 19, 2027" not "May 19" | 🔲 |

---

## How to Run Open Tests

**Requires `ADMIN_TOKEN` to be set first** (tests 7.2–7.5):
```bash
# Set on Render: magen-api → Environment → ADMIN_TOKEN=<your-token>
curl -s -X POST https://magen-api.onrender.com/api/admin/pause \
  -H "Authorization: Bearer <your-token>"
```

**On-chain amount privacy** (test 5.6):
1. Find a confirmed txHash from a real execution
2. Look it up on https://sepolia.arbiscan.io/
3. Click "Input Data" → decode
4. Confirm `encryptedAmount` param is a 32-byte handle, not a recognisable number

**Agent auth** (tests 6.3–6.5):
- Run agent locally: `cd packages/agent && npx tsx src/index.ts`
- Observe it signing and successfully polling `/jobs/pending`
