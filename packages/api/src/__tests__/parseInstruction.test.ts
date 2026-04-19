import { jest, describe, it, expect, beforeEach } from "@jest/globals";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockCreate = jest.fn() as jest.Mock<any>;

jest.unstable_mockModule("openai", () => ({
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

jest.unstable_mockModule("../services/chainGptEnrich.js", () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  enrichWithChainGpt: (jest.fn() as jest.Mock<any>).mockResolvedValue({}),
}));

const { parseInstruction } = await import("../services/parseInstruction.js");

const VALID_LLM_OUTPUT = {
  recipient_wallet: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
  recipient_display_name: "Alice",
  amount_usdc: "500.00",
  frequency: "monthly",
  start_date: "2026-01-01T00:00:00.000Z",
  approval_mode: "ask-every-time",
};

function mockLlmResponse(content: object) {
  mockCreate.mockResolvedValueOnce({
    choices: [{ message: { content: JSON.stringify(content) } }],
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("parseInstruction", () => {
  it("returns a valid policy when LLM output matches schema", async () => {
    // #given
    mockLlmResponse(VALID_LLM_OUTPUT);

    // #when
    const result = await parseInstruction("pay alice 500 USDC monthly");

    // #then
    expect(result.validationErrors).toBeNull();
    expect(result.policy).not.toBeNull();
    expect(result.policy?.recipient_display_name).toBe("Alice");
    expect(result.policy?.amount_usdc).toBe("500.00");
    expect(result.policy?.frequency).toBe("monthly");
  });

  it("returns recipientUnresolved=true when LLM returns UNRESOLVED wallet", async () => {
    // #given
    mockLlmResponse({ ...VALID_LLM_OUTPUT, recipient_wallet: "UNRESOLVED" });

    // #when
    const result = await parseInstruction("pay some_guy 100 USDC");

    // #then
    expect(result.recipientUnresolved).toBe(true);
    expect(result.policy).toBeNull();
    expect(result.validationErrors).toContain(
      "Recipient wallet address could not be determined"
    );
  });

  it("returns validationErrors when LLM returns unknown frequency", async () => {
    // #given
    mockLlmResponse({ ...VALID_LLM_OUTPUT, frequency: "biweekly" });

    // #when
    const result = await parseInstruction("pay alice 500 USDC biweekly");

    // #then
    expect(result.policy).toBeNull();
    expect(result.validationErrors?.some((e) => e.includes("frequency"))).toBe(true);
  });

  it("returns validationErrors when LLM returns numeric amount instead of string", async () => {
    // #given
    mockLlmResponse({ ...VALID_LLM_OUTPUT, amount_usdc: 500 });

    // #when
    const result = await parseInstruction("pay alice 500 USDC");

    // #then
    expect(result.policy).toBeNull();
    expect(result.validationErrors?.some((e) => e.includes("amount_usdc"))).toBe(true);
  });

  it("returns validationErrors when approve-for-period is missing approval_period_end", async () => {
    // #given
    mockLlmResponse({ ...VALID_LLM_OUTPUT, approval_mode: "approve-for-period" });

    // #when
    const result = await parseInstruction("pay alice 500 USDC, auto-approve");

    // #then
    expect(result.policy).toBeNull();
    expect(
      result.validationErrors?.some((e) => e.includes("approval_period_end"))
    ).toBe(true);
  });

  it("returns validationErrors when amount has more than 6 decimal places", async () => {
    // #given
    mockLlmResponse({ ...VALID_LLM_OUTPUT, amount_usdc: "500.1234567" });

    // #when
    const result = await parseInstruction("pay alice 500 USDC");

    // #then
    expect(result.policy).toBeNull();
    expect(result.validationErrors).not.toBeNull();
  });

  it("returns error when LLM returns non-JSON", async () => {
    // #given
    mockCreate.mockResolvedValueOnce({
      choices: [{ message: { content: "Sorry, I cannot help." } }],
    });

    // #when
    const result = await parseInstruction("pay alice 500 USDC");

    // #then
    expect(result.policy).toBeNull();
    expect(result.validationErrors).toContain("LLM returned non-JSON output");
  });

  it("includes enrichment data from chainGpt in the result", async () => {
    // #given
    const { enrichWithChainGpt } = await import("../services/chainGptEnrich.js");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (enrichWithChainGpt as jest.Mock<any>).mockResolvedValueOnce({
      onChainContext: "alice.eth resolves to a known address",
    });
    mockLlmResponse(VALID_LLM_OUTPUT);

    // #when
    const result = await parseInstruction("pay alice.eth 500 USDC");

    // #then
    expect(result.enrichment).toEqual({
      onChainContext: "alice.eth resolves to a known address",
    });
  });
});
