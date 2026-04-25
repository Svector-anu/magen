import { resolveIdentifier } from "../src/services/resolveIdentifier.js";

const cases = [
  { label: "raw address",         input: "0x5a927ac639636e534b678e81768ca19e2c6280b7" },
  { label: "Farcaster username",  input: "dwr" },
  { label: "@farcaster handle",   input: "@dwr" },
  { label: "X username (via FC)", input: "elonmusk" },
  { label: "ENS name",            input: "vitalik.eth" },
  { label: "bare ENS fallback",   input: "vitalik" },
  { label: "unknown name",        input: "zzznotarealuser9999" },
];

console.log(`NEYNAR_API_KEY: ${process.env.NEYNAR_API_KEY ? "SET ✓" : "NOT SET — Farcaster paths will skip"}\n`);

for (const { label, input } of cases) {
  process.stdout.write(`[${label}] "${input}" → `);
  try {
    const result = await resolveIdentifier(input);
    if (result.status === "not_found") {
      console.log("not_found");
    } else {
      console.log(`${result.status} | ${result.contact.wallet_address} | display: ${result.contact.display_name}`);
    }
  } catch (e) {
    console.log(`ERROR: ${(e as Error).message}`);
  }
}
