# Magen — Architecture

Magen is a recurring crypto disbursement system running on Arbitrum Sepolia. A payer configures policies (amount, recipient, frequency) through the frontend. The API scheduler queues execution jobs at each trigger interval. A separate agent process polls for pending jobs, signs requests with a private key, and tells the API to execute — which encrypts the transfer amount through the Nox TEE gateway and calls the on-chain `DisbursementAgent`, which routes the call to the payer's `DisbursementVault`, which calls `confidentialTransferFrom` on `WrappedUSDC`. Transfer amounts are never visible on-chain.

---

## Actors

| Actor | Description |
|---|---|
| **Payer** | Owns a `DisbursementVault`, holds `WrappedUSDC`, and configures disbursement policies via the frontend |
| **Recipient** | EVM wallet address (or ENS name) that receives `WrappedUSDC` on each execution |
| **Agent** | Off-chain worker process (`packages/agent`) that authenticates with vestauth and triggers execution |
| **API server** | Express service that manages policies/jobs, drives the scheduler, and holds the private key that owns `DisbursementAgent` |

---

## Monorepo Structure

```
magen/
├── packages/
│   ├── api/          — Express API server, scheduler, SQLite store, execution logic
│   ├── agent/        — Polling worker that triggers job execution
│   ├── contracts/    — Solidity contracts + Hardhat deployment scripts
│   ├── frontend/     — Vite/React UI (policy creation, status display)
│   └── shared/       — Zod schemas shared between api and frontend
├── render.yaml       — Render.com deployment definitions
└── .env              — dotenvx-encrypted secrets (single file for all packages)
```

All packages are TypeScript ESM. The root `pnpm-workspace.yaml` links them. `@magen/shared` is built before `api` or `frontend` in every deployment.

---

## On-Chain Contracts

All contracts compile with Solidity 0.8.28 and are deployed on Arbitrum Sepolia (chain ID 421614). They import from `@iexec-nox/nox-protocol-contracts` and `@iexec-nox/nox-confidential-contracts`.

### WrappedUSDC

An `ERC20ToERC7984Wrapper` that escrows raw USDC and mints confidential `mwUSDC` (ERC-7984). The wrap operation is a single call; unwrap is two-step (async TEE decryption required to release USDC). Transfer amounts in all downstream calls are encrypted ciphertexts — never plaintext on-chain.

```solidity
function wrap(address to, uint256 amount) external;          // USDC → mwUSDC
function setOperator(address operator, uint48 until) external; // payer authorises vault
function confidentialTransferFrom(address from, address to,
    externalEuint256 encryptedAmount, bytes inputProof) external returns (euint256);
```

### DisbursementVault

One vault per payer. Immutably bound to `wrappedUsdc`, `agent` (the `DisbursementAgent` address), and `payer`. Only `DisbursementAgent` can call `executeDisbursement`; the vault guards against expired operator approval with `wrappedUsdc.isOperator`.

```solidity
function executeDisbursement(
    address recipient,
    externalEuint256 encryptedAmount,
    bytes calldata inputProof,
    bytes32 policyId
) external returns (euint256);
```

The `policyId` is emitted as `DisbursementExecuted(bytes32 policyId, address recipient)` for off-chain correlation with the jobs table.

### DisbursementAgent

Singleton owned by the API server wallet. Accepts calls only from `owner` and fans out to the target vault. This keeps the payer's key out of execution entirely — the payer signs only the initial `setOperator` call.

```solidity
function execute(
    address vault,
    address recipient,
    externalEuint256 encryptedAmount,
    bytes calldata inputProof,
    bytes32 policyId
) external;
```

---

## API Routes

All routes are mounted under `/api`. The server also exposes `GET /health`.

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/policies` | none | Create a policy and immediately queue its first job |
| `GET` | `/policies` | none | List all active policies |
| `DELETE` | `/policies/:id` | none | Cancel a policy (sets `status = 'cancelled'`) |
| `POST` | `/execute` | vestauth | Execute a specific job by `jobId` |
| `GET` | `/jobs/pending` | vestauth | List jobs the agent should process |
| `GET` | `/jobs/:id` | none | Get status/txHash for a single job |
| `POST` | `/parse-instruction` | none | Parse a natural-language payment instruction into a `DisbursementPolicy` |
| `GET` | `/contacts` | none | List saved contacts |
| `POST` | `/contacts` | none | Create or update a contact |
| `DELETE` | `/contacts/:id` | none | Delete a contact |
| `POST` | `/resolve-recipients` | none | Resolve a list of identifiers (addresses, ENS names, display names) to contacts |

Routes protected with `requireAgent` verify a vestauth Ed25519 signature against `AGENT_PUBLIC_JWK` before proceeding.

---

## Database Schema

SQLite via `better-sqlite3`, stored at `DB_PATH` (defaults to `.magen.db` in the process working directory). WAL mode and foreign keys are enabled. Schema is applied inline at startup via `migrate()` with additive `ALTER TABLE` migrations for columns added after initial release.

```sql
CREATE TABLE policies (
  id                   TEXT PRIMARY KEY,
  recipient_wallet     TEXT NOT NULL,         -- checksummed EVM address
  recipient_display_name TEXT NOT NULL,
  amount_usdc          TEXT NOT NULL,         -- decimal string, e.g. "50.00"
  frequency            TEXT NOT NULL,         -- "once" | "daily" | "weekly" | "monthly"
  approval_mode        TEXT NOT NULL,         -- "ask-every-time" | "approve-for-period" | "continue-until-revoked"
  start_date           TEXT NOT NULL,
  end_date             TEXT,
  approval_period_end  TEXT,
  memo                 TEXT,
  vault_address        TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'active',  -- active | cancelled | expired | paused
  last_executed_at     TEXT,
  next_execution_at    TEXT NOT NULL,
  created_at           TEXT NOT NULL
);

CREATE TABLE jobs (
  id            TEXT PRIMARY KEY,
  policy_id     TEXT NOT NULL REFERENCES policies(id),
  status        TEXT NOT NULL DEFAULT 'pending',  -- pending | processing | done | failed
  tx_hash       TEXT,
  error         TEXT,
  attempt       INTEGER NOT NULL DEFAULT 0,
  next_retry_at TEXT,
  created_at    TEXT NOT NULL
);
```

---

## Scheduler

The API process runs a scheduler loop via `setInterval` with a 30-second period, starting immediately on `app.listen`. Each tick calls `listDuePolicies()`, which selects active policies whose `next_execution_at` has passed, whose `end_date` and `approval_period_end` (if set) are still in the future, and that have no existing `pending` or `processing` job. For each matching policy, a new job row is inserted with `status = 'pending'` and `attempt = 0`. The agent picks these up on its next poll.

---

## Agent Process

`packages/agent/src/index.ts` is a standalone Node.js process deployed as a Render worker. It polls `GET /api/jobs/pending` every 5 seconds. Every request is signed with a vestauth Ed25519 private key (`AGENT_PRIVATE_JWK`) via `vestauth.primitives.headers(method, url, uid, privateJwk)`. For each returned job, it calls `POST /api/execute` with `{ jobId }`, also signed. The agent is stateless — it only drives the API; all state lives in the API's SQLite database.

```
[agent] started — polling http://<API_BASE>/jobs/pending every 5s
  → GET /api/jobs/pending  (signed)
  → POST /api/execute { jobId }  (signed, per job)
```

---

## Execution Path

`POST /api/execute` calls `executePolicy()` in `packages/api/src/services/executePolicy.ts`:

1. **Atomic conversion** — decimal USDC string (e.g. `"50.25"`) → `uint256` micro-units (6 decimals).
2. **Nox encryption** — `POST https://<NOX_GATEWAY>/v0/secrets` with `{ value, solidityType: "uint256", applicationContract: wrappedUsdcAddress, owner: vaultAddress }`. The gateway returns an `(handle, proof)` pair. The handle is an `externalEuint256` (bytes32); the proof binds it to the target `wrappedUsdc` contract address.
3. **On-chain call** — `DisbursementAgent.execute(vault, recipient, handle, proof, keccak256(policyId))` is sent from the API server wallet with fixed EIP-1559 gas caps (`maxFeePerGas: 500 Mwei`, `maxPriorityFeePerGas: 1 Mwei`).
4. **Receipt** — `tx.wait()` resolves to `{ txHash }`, which is stored in the job row and returned to the agent.
5. **Policy advance** — on success, `advancePolicy()` computes the next `next_execution_at` based on frequency (`+1 day / +7 days / +1 month`). For `"once"` policies the status is set to `'expired'`.

---

## Retry Logic

`POST /api/execute` applies a three-attempt backoff before giving up:

```
MAX_ATTEMPTS = 3
RETRY_DELAYS_MS = [60_000, 300_000]  // attempt 0→1: 1 min; attempt 1→2: 5 min
```

On each failure the handler classifies the error as **permanent** or **transient**:

- **Permanent** (`CALL_EXCEPTION`, `Missing required env`, `INSUFFICIENT_FUNDS`) — skip retries, set job `status = 'failed'`, set policy `status = 'paused'` immediately.
- **Transient** (everything else) — if `attempt + 1 < MAX_ATTEMPTS`, set job back to `status = 'pending'` with `next_retry_at = now + delay`. The `listPendingJobs` query filters by `next_retry_at <= datetime('now')`, so the agent will not re-execute the job until the backoff window expires. After three failed attempts the job is marked `'failed'` and the policy is paused.

---

## Secrets Management

All secrets live in a single `.env` at the repo root. dotenvx (`@dotenvx/dotenvx`) encrypts values at rest using an asymmetric keypair. The public key is committed in `.env` as `DOTENV_PUBLIC_KEY`. The private decryption key lives only in `.env.keys` (gitignored) and must be supplied to the runtime as `DOTENV_PRIVATE_KEY`. Both the API and agent load the file at process start with:

```ts
import { config } from "@dotenvx/dotenvx";
config({ path: resolve(import.meta.dirname, "../../../.env") });
```

On Render, `DOTENV_PRIVATE_KEY` is set as a secret environment variable. All other variables in `.env` remain encrypted in source control and are decrypted in-memory at startup.

Key variables:

| Variable | Consumer |
|---|---|
| `ARBITRUM_SEPOLIA_RPC` | api, agent |
| `PRIVATE_KEY` | api (signs on-chain txs), agent |
| `DISBURSEMENT_AGENT_ADDRESS` | api |
| `DISBURSEMENT_VAULT_ADDRESS` | api (scripts), frontend |
| `WRAPPED_USDC_ADDRESS` | api, frontend |
| `USDC_ADDRESS` | scripts only |
| `AGENT_PUBLIC_JWK` | api (vestauth middleware) |
| `AGENT_PRIVATE_JWK` | agent (vestauth signing) |
| `OPENAI_API_KEY` / `GROQ_API_KEY` / `XAI_API_KEY` | api (parse-instruction) |
| `CHAINGPT_API_KEY` | api (optional enrichment) |

---

## Deployment

`render.yaml` defines three services:

| Service | Type | Build | Start |
|---|---|---|---|
| `magen-api` | web | `pnpm --filter @magen/shared build && pnpm --filter @magen/api build` | `node packages/api/dist/index.js` |
| `magen-agent` | worker | `pnpm --filter @magen/shared build && pnpm --filter @magen/agent build` | `node packages/agent/dist/index.js` |
| `magen-frontend` | static | `pnpm --filter @magen/frontend build` | served from `packages/frontend/dist` with SPA rewrite |

Health check for `magen-api` is at `GET /health`. The frontend reads `VITE_WRAPPED_USDC_ADDRESS`, `VITE_VAULT_ADDRESS`, and `VITE_API_URL` at build time.

---

## Dev Scripts

Both scripts live in `packages/api/src/scripts/` and are run directly with `tsx`.

**`fund-and-wrap.ts`** — Approves `WrappedUSDC` to spend raw USDC from the payer wallet, then calls `wrap(payerAddress, amount)`. Run after receiving testnet USDC from the [Circle faucet](https://faucet.circle.com).

```bash
WRAP_AMOUNT_USDC=10 npx tsx src/scripts/fund-and-wrap.ts
```

**`inspect-chain.ts`** — Reads and prints live state from all deployed contracts: API wallet ETH balance, `vault.payer`, `vault.agent`, `vault.wrappedUsdc`, `agent.owner`, payer raw USDC balance, and `isOperator(payer, vault)`. Useful for verifying a deployment is wired correctly before sending the first policy.

```bash
npx tsx src/scripts/inspect-chain.ts
```