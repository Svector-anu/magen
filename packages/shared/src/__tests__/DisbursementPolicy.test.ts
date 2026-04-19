import { DisbursementPolicySchema } from "../schemas/DisbursementPolicy.js";

const validBase = {
  id: "123e4567-e89b-12d3-a456-426614174001",
  recipient_wallet: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
  recipient_display_name: "Alice",
  amount_usdc: "100.50",
  frequency: "monthly" as const,
  start_date: "2024-01-01T00:00:00.000Z",
  approval_mode: "ask-every-time" as const,
  created_at: "2024-01-01T00:00:00.000Z",
};

describe("DisbursementPolicySchema", () => {
  it("accepts a valid ask-every-time policy", () => {
    const result = DisbursementPolicySchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("accepts approve-for-period when approval_period_end is present", () => {
    const result = DisbursementPolicySchema.safeParse({
      ...validBase,
      approval_mode: "approve-for-period",
      approval_period_end: "2024-06-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects approve-for-period without approval_period_end", () => {
    const result = DisbursementPolicySchema.safeParse({
      ...validBase,
      approval_mode: "approve-for-period",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("approval_period_end");
    }
  });

  it("rejects end_date before start_date", () => {
    const result = DisbursementPolicySchema.safeParse({
      ...validBase,
      end_date: "2023-12-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain("end_date");
    }
  });

  it("rejects invalid wallet address", () => {
    const result = DisbursementPolicySchema.safeParse({
      ...validBase,
      recipient_wallet: "0xBAD",
    });
    expect(result.success).toBe(false);
  });

  it("rejects amount with more than 6 decimal places (AI hallucination)", () => {
    const result = DisbursementPolicySchema.safeParse({
      ...validBase,
      amount_usdc: "100.1234567",
    });
    expect(result.success).toBe(false);
  });

  it("rejects numeric amount instead of string (AI hallucination)", () => {
    const result = DisbursementPolicySchema.safeParse({
      ...validBase,
      amount_usdc: 100.5,
    });
    expect(result.success).toBe(false);
  });

  it("rejects unknown frequency (AI hallucination: 'biweekly')", () => {
    const result = DisbursementPolicySchema.safeParse({
      ...validBase,
      frequency: "biweekly",
    });
    expect(result.success).toBe(false);
  });

  it("rejects memo over 280 chars", () => {
    const result = DisbursementPolicySchema.safeParse({
      ...validBase,
      memo: "x".repeat(281),
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const { recipient_wallet, ...missing } = validBase;
    const result = DisbursementPolicySchema.safeParse(missing);
    expect(result.success).toBe(false);
  });
});
