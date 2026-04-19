import { GeneralChat } from "@chaingpt/generalchat";

let client: GeneralChat | null = null;

function getClient(): GeneralChat | null {
  const apiKey = process.env.CHAINGPT_API_KEY;
  if (!apiKey) return null;
  if (!client) client = new GeneralChat({ apiKey });
  return client;
}

export interface EnrichmentResult {
  onChainContext?: string;
}

export async function enrichWithChainGpt(
  instruction: string
): Promise<EnrichmentResult> {
  const cgpt = getClient();
  if (!cgpt) return {};

  try {
    const question = [
      "You are a web3 assistant. Given the following payment instruction, provide any relevant on-chain context:",
      "- If an ENS name or wallet address is mentioned, note if it appears valid",
      "- If a token amount is mentioned, note if it looks reasonable for USDC (6 decimals)",
      "- Keep your response to 2-3 sentences maximum",
      "",
      `Instruction: "${instruction}"`,
    ].join("\n");

    const resp = await cgpt.createChatBlob({
      question,
      chatHistory: "off",
    });

    const text: string =
      typeof resp === "object" && resp !== null && "data" in resp
        ? String((resp as { data: unknown }).data)
        : typeof resp === "string"
          ? resp
          : "";

    return { onChainContext: text.trim() || undefined };
  } catch {
    return {};
  }
}
