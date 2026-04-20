/**
 * Environment variables reference:
 *
 * Required (all environments):
 *   ARBITRUM_SEPOLIA_RPC         — RPC endpoint for Arbitrum Sepolia
 *   PRIVATE_KEY                  — Signer key for DisbursementAgent.execute() calls (API wallet)
 *   USDC_ADDRESS                 — Raw USDC token contract address
 *   WRAPPED_USDC_ADDRESS         — WrappedUSDC (ERC-7984) contract address
 *   DISBURSEMENT_VAULT_ADDRESS   — Per-payer DisbursementVault contract address
 *   DISBURSEMENT_AGENT_ADDRESS   — Singleton DisbursementAgent contract address
 *   AGENT_PUBLIC_JWK             — vestauth Ed25519 public key (JSON string) for agent auth
 *
 * Required in staging/prod:
 *   ADMIN_TOKEN                  — Bearer token for POST /api/admin/pause|resume
 *
 * Optional:
 *   WEBHOOK_URL                  — Discord/Slack-compatible webhook for execution alerts
 *   WEBHOOK_ENABLED              — Set "false" to suppress webhook even if WEBHOOK_URL is set
 *   EXECUTION_PAUSED             — Set "true" to hard-pause all execution at startup
 *   APP_ENV                      — dev | staging | prod (default: dev)
 *   API_PORT                     — HTTP port (default: 3001)
 *   FRONTEND_URL                 — Allowed CORS origin (default: http://localhost:5173)
 *   DB_PATH                      — SQLite file path (default: .magen.db in cwd)
 *
 * Key separation:
 *   Each environment MUST use a distinct PRIVATE_KEY and AGENT_PUBLIC/PRIVATE_JWK pair.
 *   Never reuse dev keys in staging or prod.
 */

const REQUIRED_ALWAYS = [
  "ARBITRUM_SEPOLIA_RPC",
  "PRIVATE_KEY",
  "USDC_ADDRESS",
  "WRAPPED_USDC_ADDRESS",
  "DISBURSEMENT_VAULT_ADDRESS",
  "DISBURSEMENT_AGENT_ADDRESS",
  "AGENT_PUBLIC_JWK",
] as const;

const REQUIRED_NON_DEV = ["ADMIN_TOKEN"] as const;

export function validateEnv(): void {
  const appEnv = process.env.APP_ENV ?? "dev";
  const missing: string[] = [];

  for (const key of REQUIRED_ALWAYS) {
    if (!process.env[key]) missing.push(key);
  }

  if (appEnv !== "dev") {
    for (const key of REQUIRED_NON_DEV) {
      if (!process.env[key]) missing.push(key);
    }
  }

  if (missing.length) {
    throw new Error(
      `[config] Missing required environment variables for APP_ENV="${appEnv}":\n  ${missing.join("\n  ")}\n` +
      `See packages/api/src/services/config.ts for the full reference.`
    );
  }

  if (appEnv !== "dev" && !process.env.WEBHOOK_URL) {
    console.warn("[config] WEBHOOK_URL not set — execution alerts will only appear in logs");
  }

  if (appEnv !== "dev" && !process.env.ADMIN_TOKEN) {
    console.warn("[config] ADMIN_TOKEN not set — admin pause endpoint disabled");
  }

  console.log(`[config] env validated (APP_ENV=${appEnv})`);
}
