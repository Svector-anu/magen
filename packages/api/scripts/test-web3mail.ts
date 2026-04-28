/**
 * test-web3mail.ts
 *
 * Verifies the iExec Web3Mail pipeline:
 *   1. Client initializes with PRIVATE_KEY
 *   2. fetchMyContacts() returns opted-in users
 *   3. (optional) sends a test email to a specific protected data address
 *
 * Usage:
 *   cd packages/api
 *   npx tsx scripts/test-web3mail.ts
 *
 * To send a test email (requires opted-in user):
 *   TEST_SEND=1 PROTECTED_DATA=0x... npx tsx scripts/test-web3mail.ts
 */
import { config } from "@dotenvx/dotenvx";
import { resolve } from "path";
config({ path: resolve(import.meta.dirname, "../../../.env") });

import { IExecWeb3mail, getWeb3Provider } from "@iexec/web3mail";

const PRIVATE_KEY = process.env.PRIVATE_KEY;

if (!PRIVATE_KEY) {
  console.error("✕ PRIVATE_KEY not set in env.");
  console.error("  Set it in the root .env or export it directly.");
  process.exit(1);
}

console.log("PRIVATE_KEY:  SET ✓");
console.log("Network:      Arbitrum Sepolia (chainId 421614)");
console.log("");

let client: IExecWeb3mail;
try {
  const provider = getWeb3Provider(PRIVATE_KEY, {
    host: 421614,
    allowExperimentalNetworks: true,
  });
  client = new IExecWeb3mail(provider);
  console.log("[1/3] Client initialized ✓");
} catch (err) {
  console.error("[1/3] Client init FAILED:", String(err));
  process.exit(1);
}

let contacts: Awaited<ReturnType<typeof client.fetchMyContacts>>;
try {
  console.log("[2/3] Fetching opted-in contacts (fetchMyContacts)…");
  contacts = await client.fetchMyContacts();
  console.log(`      Found ${contacts.length} opted-in contact(s)`);
  if (contacts.length > 0) {
    for (const c of contacts) {
      console.log(`      · owner: ${c.owner}  protectedData: ${c.address}`);
    }
  } else {
    console.log("      No contacts yet — users need to opt-in via the Notifications modal in the app.");
  }
} catch (err) {
  const msg = String(err);
  console.error("[2/3] fetchMyContacts FAILED:", msg);
  if (msg.includes("RLC") || msg.includes("balance") || msg.includes("iExec")) {
    console.error("      Likely cause: API wallet has no testnet RLC.");
    console.error("      Get testnet RLC at: https://faucet.iex.ec (select Bellecour or Arbitrum Sepolia)");
  }
  process.exit(1);
}

// Optional: send a test email
const testSend = process.env.TEST_SEND === "1";
const protectedData = process.env.PROTECTED_DATA ?? contacts[0]?.address;

if (!testSend) {
  console.log("[3/3] Skipped (set TEST_SEND=1 to send a test email)");
  console.log("\nAll checks passed ✓");
  process.exit(0);
}

if (!protectedData) {
  console.log("[3/3] No protected data address available. Opt-in a user first.");
  process.exit(0);
}

try {
  console.log(`[3/3] Sending test email to protectedData: ${protectedData}…`);
  await client.sendEmail({
    protectedData,
    emailSubject: "Magen Web3Mail test",
    emailContent: "<p>This is a test email from the Magen Web3Mail pipeline. If you received this, email notifications are working.</p>",
    contentType: "text/html",
    senderName: "Magen",
  });
  console.log("      ✓ Email sent successfully");
} catch (err) {
  const e = err as { message?: string; cause?: { message?: string; cause?: unknown } };
  console.error("[3/3] sendEmail FAILED:", e.message ?? String(err));
  if (e.cause?.message) console.error("      Cause:", e.cause.message);
  if (e.cause?.cause)   console.error("      Cause2:", String(e.cause.cause));
  const full = JSON.stringify(err, Object.getOwnPropertyNames(err as object), 2);
  console.error("      Full:", full.slice(0, 800));
  process.exit(1);
}

console.log("\nAll checks passed ✓");
