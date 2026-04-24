import OpenAI from "openai";
import { randomUUID } from "crypto";
import { DisbursementPolicySchema, type DisbursementPolicy } from "@magen/shared";
import { enrichWithChainGpt } from "./chainGptEnrich.js";
import { resolveIdentifier } from "./resolveIdentifier.js";

let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    if (process.env.XAI_API_KEY) {
      _openai = new OpenAI({ apiKey: process.env.XAI_API_KEY, baseURL: "https://api.x.ai/v1" });
    } else if (process.env.GROQ_API_KEY) {
      _openai = new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: "https://api.groq.com/openai/v1" });
    } else {
      _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
  }
  return _openai;
}

const SYSTEM_PROMPT = `You are a disbursement policy parser. Given a plain-English payment instruction, extract structured parameters.

RULES:
- amount_usdc: decimal string with up to 6 decimal places (e.g. "100.50"). USDC has 6 decimals.
- frequency: ONLY one of: "once", "daily", "weekly", "monthly"
- approval_mode: ONLY one of: "ask-every-time", "approve-for-period", "continue-until-revoked"
- start_date: ISO 8601 UTC datetime. If not specified, use current time.
- end_date: ISO 8601 UTC datetime. Only include if explicitly stated.
- recipient_wallet: must be a valid 0x EVM address (42 hex chars). If the input uses a name/ENS that you cannot resolve to a confirmed wallet, set recipient_wallet to "UNRESOLVED" and recipient_display_name to the name given.
- memo: optional note, max 280 chars.
- approval_period_end: ISO 8601 UTC datetime. REQUIRED when approval_mode is "approve-for-period".

IMPORTANT: If the recipient wallet address cannot be determined from the instruction, return recipient_wallet as "UNRESOLVED". The caller will handle resolution. Do not hallucinate wallet addresses.

Respond with ONLY a JSON object matching this exact shape:
{
  "recipient_wallet": string,
  "recipient_display_name": string,
  "amount_usdc": string,
  "frequency": "once" | "daily" | "weekly" | "monthly",
  "start_date": string,
  "end_date": string | undefined,
  "approval_mode": "ask-every-time" | "approve-for-period" | "continue-until-revoked",
  "approval_period_end": string | undefined,
  "memo": string | undefined
}`;

export interface ParseResult {
  policy: DisbursementPolicy | null;
  recipientUnresolved: boolean;
  rawLlmOutput: object;
  enrichment: object;
  validationErrors: string[] | null;
}

export async function parseInstruction(
  instruction: string
): Promise<ParseResult> {
  const enrichmentPromise = enrichWithChainGpt(instruction);

  const completion = await getOpenAI().chat.completions.create({
    model: process.env.XAI_API_KEY ? "grok-3-mini" : process.env.GROQ_API_KEY ? "llama-3.3-70b-versatile" : "gpt-4o-mini",
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: `Current UTC time: ${new Date().toISOString()}\n\n${instruction}` },
    ],
    temperature: 0,
  });

  const rawText = completion.choices[0]?.message?.content ?? "{}";
  let rawLlmOutput: object;
  try {
    rawLlmOutput = JSON.parse(rawText);
  } catch {
    return {
      policy: null,
      recipientUnresolved: false,
      rawLlmOutput: {},
      enrichment: {},
      validationErrors: ["LLM returned non-JSON output"],
    };
  }

  const enrichment = await enrichmentPromise;

  const isUnresolved =
    (rawLlmOutput as Record<string, unknown>)["recipient_wallet"] === "UNRESOLVED";

  if (isUnresolved) {
    const displayName = String((rawLlmOutput as Record<string, unknown>)["recipient_display_name"] ?? "");
    const outcome = displayName ? await resolveIdentifier(displayName) : { status: "not_found" as const };

    if (outcome.status !== "not_found") {
      (rawLlmOutput as Record<string, unknown>)["recipient_wallet"] = outcome.contact.wallet_address;
      (rawLlmOutput as Record<string, unknown>)["recipient_display_name"] = outcome.contact.display_name;
    } else {
      return {
        policy: null,
        recipientUnresolved: true,
        rawLlmOutput,
        enrichment,
        validationErrors: [`Could not resolve "${displayName}" to a wallet address`],
      };
    }
  }

  const candidate = {
    ...(rawLlmOutput as Record<string, unknown>),
    id: randomUUID(),
    created_at: new Date().toISOString(),
  };

  const result = DisbursementPolicySchema.safeParse(candidate);

  if (!result.success) {
    return {
      policy: null,
      recipientUnresolved: false,
      rawLlmOutput,
      enrichment,
      validationErrors: result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`
      ),
    };
  }

  return {
    policy: result.data,
    recipientUnresolved: false,
    rawLlmOutput,
    enrichment,
    validationErrors: null,
  };
}
