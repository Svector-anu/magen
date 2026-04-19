import { ContactSchema } from "../schemas/Contact.js";

const validBase = {
  id: "123e4567-e89b-12d3-a456-426614174000",
  display_name: "Alice",
  aliases: ["alice.eth", "al"],
  wallet_address: "0xAbCdEf1234567890AbCdEf1234567890AbCdEf12",
  resolution_status: "confirmed" as const,
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-02T00:00:00.000Z",
};

describe("ContactSchema", () => {
  it("accepts a valid confirmed contact", () => {
    const result = ContactSchema.safeParse(validBase);
    expect(result.success).toBe(true);
  });

  it("accepts unresolved contact without wallet", () => {
    const result = ContactSchema.safeParse({
      ...validBase,
      wallet_address: undefined,
      resolution_status: "unresolved",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid UUID", () => {
    const result = ContactSchema.safeParse({ ...validBase, id: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects malformed wallet address", () => {
    const result = ContactSchema.safeParse({
      ...validBase,
      wallet_address: "0xSHORT",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid resolution_status (AI hallucination: 'verified')", () => {
    const result = ContactSchema.safeParse({
      ...validBase,
      resolution_status: "verified",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-datetime created_at (AI hallucination: unix timestamp)", () => {
    const result = ContactSchema.safeParse({
      ...validBase,
      created_at: "1704067200",
    });
    expect(result.success).toBe(false);
  });

  it("defaults aliases to empty array when omitted", () => {
    const { aliases, ...withoutAliases } = validBase;
    const result = ContactSchema.safeParse(withoutAliases);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.aliases).toEqual([]);
    }
  });
});
